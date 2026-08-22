import { createSharedComposable } from "@vueuse/core";
import { useStreams } from "./useStreams";
import { useFavorites } from "./useFavorites";
import { useRecents } from "./useRecents";
import { usePreferences } from "./usePreferences";
import { useI18n } from "vue-i18n";
import type { Stream } from "./useStreams";
import type { FavoriteChannel } from "./useFavorites";
import type { RecentChannel } from "./useRecents";

export interface BackupData {
  version: number;
  app: "multistream";
  exportedAt: number;
  streams: Stream[];
  favorites: FavoriteChannel[];
  recents: RecentChannel[];
  preferences: {
    selectedChat: string;
    sidebarOpen: boolean;
    notificationsEnabled: boolean;
    locale?: string;
    followedSidebarOpen?: boolean;
    recordingQuality?: string;
    recordingPath?: string;
    nativePlayerEnabled?: boolean;
  };
  watchHistory?: Record<string, number>;
}

const VALID_PLATFORMS = new Set(["kick", "twitch", "youtube", "custom"]);

/**
 * Validates the base shape of any channel-like object (Stream, Favorite, Recent).
 */
const isValidChannelShape = (item: any): boolean => {
  if (!item || typeof item !== "object") return false;
  if (typeof item.channel !== "string") return false;
  if (!VALID_PLATFORMS.has(item.platform)) return false;
  if (item.iframeUrl !== undefined && typeof item.iframeUrl !== "string") return false;
  return true;
};

/**
 * Validates the imported backup data structure to ensure it matches the BackupData interface.
 */
export const validateBackupData = (data: any): data is BackupData => {
  if (!data || typeof data !== "object") return false;
  if (data.app !== "multistream") return false;
  if (typeof data.version !== "number" || typeof data.exportedAt !== "number") return false;

  // Validate streams
  if (!Array.isArray(data.streams)) return false;
  for (const s of data.streams) {
    if (!isValidChannelShape(s) || typeof s.id !== "string") return false;
  }

  // Validate favorites
  if (!Array.isArray(data.favorites)) return false;
  for (const f of data.favorites) {
    if (!isValidChannelShape(f) || typeof f.addedAt !== "number") return false;
  }

  // Validate recents
  if (!Array.isArray(data.recents)) return false;
  for (const r of data.recents) {
    if (!isValidChannelShape(r) || typeof r.addedAt !== "number") return false;
  }

  // Validate preferences
  const prefs = data.preferences;
  if (!prefs || typeof prefs !== "object") return false;
  if (typeof prefs.selectedChat !== "string") return false;
  if (typeof prefs.sidebarOpen !== "boolean") return false;
  if (typeof prefs.notificationsEnabled !== "boolean") return false;

  if (prefs.locale !== undefined && typeof prefs.locale !== "string") return false;
  if (prefs.followedSidebarOpen !== undefined && typeof prefs.followedSidebarOpen !== "boolean")
    return false;
  if (prefs.recordingQuality !== undefined && typeof prefs.recordingQuality !== "string")
    return false;
  if (prefs.recordingPath !== undefined && typeof prefs.recordingPath !== "string") return false;
  if (prefs.nativePlayerEnabled !== undefined && typeof prefs.nativePlayerEnabled !== "boolean")
    return false;

  // Validate watchHistory
  if (data.watchHistory !== undefined) {
    if (
      typeof data.watchHistory !== "object" ||
      data.watchHistory === null ||
      Array.isArray(data.watchHistory)
    ) {
      return false;
    }
    for (const key of Object.keys(data.watchHistory)) {
      if (typeof data.watchHistory[key] !== "number") return false;
    }
  }

  return true;
};

/**
 * Deduplicates an array of items based on a unique key generator.
 */
const deduplicateBy = <T>(items: T[], keyFn: (item: T) => string): T[] => {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
};

const _useBackup = () => {
  const { streams, watchHistory } = useStreams();
  const { favorites } = useFavorites();
  const { recents } = useRecents();

  const {
    selectedChat,
    sidebarOpen,
    notificationsEnabled,
    followedSidebarOpen,
    recordingQuality,
    recordingPath,
    nativePlayerEnabled,
  } = usePreferences();

  // Retrieve locale from vue-i18n. If called outside standard Vue setup, fallback gracefully.
  let locale: any = null;
  try {
    const i18n = useI18n();
    locale = i18n.locale;
  } catch (e) {
    // fallback context
  }

  type SaveResult = "saved" | "cancelled" | "failed";

  /**
   * Attempts to save the backup using the Tauri native dialog and filesystem.
   */
  const tryTauriSave = async (fileName: string, jsonString: string): Promise<SaveResult> => {
    if (typeof window === "undefined" || !(window as any).__TAURI_INTERNALS__) return "failed";

    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");

      let initialPath: string | undefined;
      try {
        const { downloadDir, join } = await import("@tauri-apps/api/path");
        const dlDir = await downloadDir();
        initialPath = await join(dlDir, fileName);
      } catch (pathErr) {
        console.warn("Could not get download dir for initial path:", pathErr);
        initialPath = fileName;
      }

      const filePath = await save({
        defaultPath: initialPath,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (!filePath) return "cancelled"; // User cancelled

      try {
        await writeTextFile(filePath, jsonString);
        return "saved";
      } catch (writeErr) {
        console.error("Failed to write file at chosen path:", writeErr);
        throw new Error(`Failed to save file: ${writeErr}`, { cause: writeErr });
      }
    } catch (err: any) {
      if (err instanceof Error && err.message.startsWith("Failed to save file:")) {
        throw err;
      }
      console.error("Tauri native save failed, falling back to legacy download:", err);
      return "failed";
    }
  };

  /**
   * Attempts to save the backup using the HTML5 File System Access API (Modern Browsers).
   */
  const tryBrowserSave = async (fileName: string, jsonString: string): Promise<SaveResult> => {
    if (typeof window === "undefined" || !("showSaveFilePicker" in window)) return "failed";

    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: "JSON Files", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(jsonString);
      await writable.close();
      return "saved";
    } catch (err: any) {
      if (err.name === "AbortError") return "cancelled"; // User cancelled
      console.error("Save file picker failed, falling back to legacy download:", err);
      return "failed";
    }
  };

  /**
   * Fallback method to download the backup using an anchor tag and ObjectURL.
   */
  const legacyDownload = (jsonString: string, fileName: string) => {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /**
   * Generates a snapshot of the current state and triggers a file download.
   */
  const exportConfig = async (): Promise<boolean> => {
    const backup: BackupData = {
      version: 1,
      app: "multistream",
      exportedAt: Date.now(),
      streams: streams.value,
      favorites: favorites.value,
      recents: recents.value,
      preferences: {
        selectedChat: selectedChat.value,
        sidebarOpen: sidebarOpen.value,
        notificationsEnabled: notificationsEnabled.value,
        followedSidebarOpen: followedSidebarOpen.value,
        recordingQuality: recordingQuality.value,
        recordingPath: recordingPath.value,
        nativePlayerEnabled: nativePlayerEnabled.value,
        ...(locale && { locale: locale.value }),
      },
      watchHistory: watchHistory.value,
    };

    const fileName = `multistream-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const jsonString = JSON.stringify(backup, null, 2);

    const tauriResult = await tryTauriSave(fileName, jsonString);
    if (tauriResult === "saved") return true;
    if (tauriResult === "cancelled") return false;

    const browserResult = await tryBrowserSave(fileName, jsonString);
    if (browserResult === "saved") return true;
    if (browserResult === "cancelled") return false;

    legacyDownload(jsonString, fileName);
    return true;
  };

  /**
   * Replaces or merges current application state with the imported backup data.
   */
  const importConfig = (data: BackupData) => {
    // 1. Grid (streams.value) is KEPT INTACT. We do not apply data.streams to the grid.

    // 2. Additive Merge for Favorites
    favorites.value = deduplicateBy(
      [...favorites.value, ...data.favorites],
      (f) => `${f.platform}:${f.channel.toLowerCase()}`
    );

    // 3. Additive Merge for Recents
    // First, convert currently watching streams into Recent format to inject at the top
    const currentStreamsAsRecents: RecentChannel[] = streams.value.map((s) => ({
      channel: s.channel,
      platform: s.platform,
      iframeUrl: s.iframeUrl,
      addedAt: Date.now(),
    }));

    recents.value = deduplicateBy(
      [...currentStreamsAsRecents, ...data.recents, ...recents.value],
      (r) => `${r.platform}:${r.channel.toLowerCase()}`
    );

    // 4. Apply Preferences (Overwrite current with backup)
    const prefs = data.preferences;
    selectedChat.value = prefs.selectedChat;
    sidebarOpen.value = prefs.sidebarOpen;
    notificationsEnabled.value = prefs.notificationsEnabled;

    if (prefs.followedSidebarOpen !== undefined)
      followedSidebarOpen.value = prefs.followedSidebarOpen;
    if (prefs.recordingQuality !== undefined) recordingQuality.value = prefs.recordingQuality;
    if (prefs.recordingPath !== undefined) recordingPath.value = prefs.recordingPath;
    if (prefs.nativePlayerEnabled !== undefined)
      nativePlayerEnabled.value = prefs.nativePlayerEnabled;

    if (prefs.locale) {
      if (locale) locale.value = prefs.locale;
      localStorage.setItem("locale", prefs.locale);
    }

    // 5. Additive Merge for Watch History
    if (data.watchHistory) {
      watchHistory.value = { ...watchHistory.value, ...data.watchHistory };
    }
  };

  return {
    exportConfig,
    importConfig,
    validateBackupData,
    streams,
    favorites,
    recents,
    selectedChat,
    sidebarOpen,
    notificationsEnabled,
    watchHistory,
  };
};

export const useBackup = createSharedComposable(_useBackup);

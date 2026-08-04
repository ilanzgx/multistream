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
  };
  watchHistory?: Record<string, number>;
}

/**
 * @brief Validate backup data format
 * @param data Parsed JSON object to check
 * @return True if data matches the BackupData interface exactly
 */
export const validateBackupData = (data: any): data is BackupData => {
  if (!data || typeof data !== "object") return false;
  if (data.app !== "multistream") return false;
  if (typeof data.version !== "number") return false;
  if (typeof data.exportedAt !== "number") return false;

  // Validate streams
  if (!Array.isArray(data.streams)) return false;
  for (const s of data.streams) {
    if (!s || typeof s !== "object") return false;
    if (typeof s.id !== "string") return false;
    if (typeof s.channel !== "string") return false;
    if (
      s.platform !== "kick" &&
      s.platform !== "twitch" &&
      s.platform !== "youtube" &&
      s.platform !== "custom"
    ) {
      return false;
    }
    if (s.iframeUrl !== undefined && typeof s.iframeUrl !== "string") {
      return false;
    }
  }

  // Validate favorites
  if (!Array.isArray(data.favorites)) return false;
  for (const f of data.favorites) {
    if (!f || typeof f !== "object") return false;
    if (typeof f.channel !== "string") return false;
    if (
      f.platform !== "kick" &&
      f.platform !== "twitch" &&
      f.platform !== "youtube" &&
      f.platform !== "custom"
    ) {
      return false;
    }
    if (typeof f.addedAt !== "number") return false;
    if (f.iframeUrl !== undefined && typeof f.iframeUrl !== "string") {
      return false;
    }
  }

  // Validate recents
  if (!Array.isArray(data.recents)) return false;
  for (const r of data.recents) {
    if (!r || typeof r !== "object") return false;
    if (typeof r.channel !== "string") return false;
    if (
      r.platform !== "kick" &&
      r.platform !== "twitch" &&
      r.platform !== "youtube" &&
      r.platform !== "custom"
    ) {
      return false;
    }
    if (typeof r.addedAt !== "number") return false;
    if (r.iframeUrl !== undefined && typeof r.iframeUrl !== "string") {
      return false;
    }
  }

  // Validate preferences
  if (!data.preferences || typeof data.preferences !== "object") return false;
  if (typeof data.preferences.selectedChat !== "string") return false;
  if (typeof data.preferences.sidebarOpen !== "boolean") return false;
  if (typeof data.preferences.notificationsEnabled !== "boolean") return false;
  if (data.preferences.locale !== undefined && typeof data.preferences.locale !== "string") {
    return false;
  }

  // Validate watchHistory
  if (data.watchHistory !== undefined) {
    if (
      typeof data.watchHistory !== "object" ||
      data.watchHistory === null ||
      Array.isArray(data.watchHistory)
    )
      return false;
    for (const key in data.watchHistory) {
      if (typeof data.watchHistory[key] !== "number") return false;
    }
  }

  return true;
};

const _useBackup = () => {
  const { streams, watchHistory } = useStreams();
  const { favorites } = useFavorites();
  const { recents } = useRecents();
  const { selectedChat, sidebarOpen, notificationsEnabled } = usePreferences();

  // Retrieve locale from vue-i18n. If called outside standard Vue setup, fallback gracefully.
  let locale: any = null;
  try {
    const i18n = useI18n();
    locale = i18n.locale;
  } catch (e) {
    // fallback context
  }

  /**
   * @brief Export configuration as a JSON file download
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
        ...(locale && { locale: locale.value }),
      },
      watchHistory: watchHistory.value,
    };

    const fileName = `multistream-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const jsonString = JSON.stringify(backup, null, 2);

    // Use Tauri native save dialog and file system if running in desktop app
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");

        let initialPath: string | undefined = undefined;
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
          filters: [
            {
              name: "JSON",
              extensions: ["json"],
            },
          ],
        });

        if (filePath) {
          try {
            await writeTextFile(filePath, jsonString);
            return true;
          } catch (writeErr) {
            console.error("Failed to write file at chosen path:", writeErr);
            // If the native write failed, we shouldn't silently fallback to the browser download
            // which ignores the user's chosen folder. Just return false or throw.
            throw new Error(`Failed to save file: ${writeErr}`, { cause: writeErr });
          }
        } else {
          return false; // User cancelled
        }
      } catch (err: any) {
        if (err instanceof Error && err.message.startsWith("Failed to save file:")) {
          throw err;
        }
        console.error("Tauri native save failed, falling back to legacy download:", err);
      }
    }

    // Try HTML5 File System Access API next (supported by modern Chromium browsers)
    const hasSaveFilePicker = typeof window !== "undefined" && "showSaveFilePicker" in window;
    if (hasSaveFilePicker) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: "JSON Files",
              accept: {
                "application/json": [".json"],
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(jsonString);
        await writable.close();
        return true;
      } catch (err: any) {
        if (err.name === "AbortError") {
          return false; // User cancelled
        }
        console.error("Save file picker failed, falling back to legacy download:", err);
      }
    }

    // Fallback for browsers/environments without showSaveFilePicker
    legacyDownload(backup, fileName);
    return true;
  };

  const legacyDownload = (backup: BackupData, fileName: string) => {
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
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
   * @brief Import configuration
   * @param data The validated BackupData object
   */
  const importConfig = (data: BackupData) => {
    streams.value = data.streams;
    favorites.value = data.favorites;
    recents.value = data.recents;
    selectedChat.value = data.preferences.selectedChat;
    sidebarOpen.value = data.preferences.sidebarOpen;
    notificationsEnabled.value = data.preferences.notificationsEnabled;
    if (data.preferences.locale) {
      if (locale) {
        locale.value = data.preferences.locale;
      }
      localStorage.setItem("locale", data.preferences.locale);
    }
    if (data.watchHistory) {
      watchHistory.value = data.watchHistory;
    }
  };

  return {
    exportConfig,
    importConfig,
    validateBackupData,
    // Expose underlying refs
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

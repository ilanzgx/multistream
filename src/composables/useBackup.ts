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

  return true;
};

const _useBackup = () => {
  const { streams } = useStreams();
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
  const exportConfig = () => {
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
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `multistream-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
  };
};

export const useBackup = createSharedComposable(_useBackup);

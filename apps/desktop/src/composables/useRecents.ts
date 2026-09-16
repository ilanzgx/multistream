import { createSharedComposable, useStorage } from "@vueuse/core";
import type { Platform } from "./useStreams";

export interface RecentChannel {
  channel: string;
  platform: Platform;
  displayName?: string;
  handle?: string;
  iframeUrl?: string;
  addedAt: number;
}

const MAX_RECENTS = 8;

const isMatchingRecent = (
  recent: RecentChannel,
  targetChannel: string,
  platform: Platform,
  iframeUrl?: string,
  handle?: string
): boolean => {
  if (recent.platform !== platform) return false;
  if (platform === "custom" && (iframeUrl || recent.iframeUrl)) {
    return recent.iframeUrl?.toLowerCase() === (iframeUrl || "").toLowerCase();
  }
  const cleanTarget = targetChannel.toLowerCase();
  const cleanHandle = handle?.toLowerCase();
  const recentChannel = recent.channel.toLowerCase();
  const recentHandle = recent.handle?.toLowerCase();

  return (
    recentChannel === cleanTarget ||
    (cleanHandle !== undefined && recentHandle === cleanHandle) ||
    (cleanHandle !== undefined && recentChannel === cleanHandle) ||
    (recentHandle !== undefined && recentHandle === cleanTarget)
  );
};

const _useRecents = () => {
  const recents = useStorage<RecentChannel[]>("recents", []);

  const addRecent = (
    channel: string,
    platform: Platform,
    iframeUrl?: string,
    displayName?: string,
    handle?: string
  ) => {
    const cleanHandle = handle ? handle.replace(/^@+/, "").trim() : undefined;
    const cleanDisplayName = displayName ? displayName.replace(/^@+/, "").trim() : undefined;
    const cleanChannel =
      platform === "youtube" && cleanHandle ? cleanHandle : channel.replace(/^@+/, "").trim();

    recents.value = recents.value.filter(
      (r) => !isMatchingRecent(r, cleanChannel, platform, iframeUrl, cleanHandle)
    );

    recents.value = [
      {
        channel: cleanChannel,
        platform,
        ...(cleanDisplayName && { displayName: cleanDisplayName }),
        ...(cleanHandle && { handle: cleanHandle }),
        ...(iframeUrl && { iframeUrl }),
        addedAt: Date.now(),
      },
      ...recents.value,
    ].slice(0, MAX_RECENTS);
  };

  const removeRecent = (channel: string, platform: Platform, iframeUrl?: string) => {
    const clean = channel.replace(/^@+/, "").trim();
    recents.value = recents.value.filter((r) => !isMatchingRecent(r, clean, platform, iframeUrl));
  };

  /**
   * @brief Clear all recents
   *
   * Clears all recents from the list.
   *
   * @return void
   */
  const clearRecents = () => {
    recents.value = [];
  };

  return {
    recents,
    addRecent,
    removeRecent,
    clearRecents,
  };
};

export const useRecents = createSharedComposable(_useRecents);

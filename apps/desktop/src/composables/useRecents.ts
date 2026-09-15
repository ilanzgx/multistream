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
      (r) =>
        !(
          (r.channel.toLowerCase() === cleanChannel.toLowerCase() ||
            (cleanHandle && r.handle?.toLowerCase() === cleanHandle.toLowerCase()) ||
            (cleanHandle && r.channel.toLowerCase() === cleanHandle.toLowerCase()) ||
            (r.handle && r.handle.toLowerCase() === cleanChannel.toLowerCase())) &&
          r.platform === platform
        )
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

  const removeRecent = (channel: string, platform: Platform) => {
    const clean = channel.replace(/^@+/, "").toLowerCase();
    recents.value = recents.value.filter(
      (r) =>
        !(
          (r.channel.toLowerCase() === clean ||
            (r.handle && r.handle.toLowerCase() === clean) ||
            (r.displayName && r.displayName.toLowerCase() === clean)) &&
          r.platform === platform
        )
    );
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

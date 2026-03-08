import { createSharedComposable, useStorage } from "@vueuse/core";
import type { Platform } from "./useStreams";

export interface RecentChannel {
  channel: string;
  platform: Platform;
  iframeUrl?: string;
  addedAt: number;
}

const MAX_RECENTS = 8;

const _useRecents = () => {
  const recents = useStorage<RecentChannel[]>("recents", []);

  /**
   * @brief Add a recent channel
   *
   * Adds a recent channel to the list of recents, removing any existing
   * entries for the same channel and platform. The new entry is added to the
   * top of the list, and the list is truncated to the maximum number of
   * recents.
   *
   * @param channel The channel name
   * @param platform The platform
   * @param iframeUrl The iframe URL (optional)
   * @return void
   */
  const addRecent = (
    channel: string,
    platform: Platform,
    iframeUrl?: string,
  ) => {
    // remove if already exists
    recents.value = recents.value.filter(
      (r) =>
        !(
          r.channel.toLowerCase() === channel.toLowerCase() &&
          r.platform === platform
        ),
    );

    // add to top
    recents.value = [
      {
        channel,
        platform,
        ...(iframeUrl && { iframeUrl }),
        addedAt: Date.now(),
      },
      ...recents.value,
    ].slice(0, MAX_RECENTS);
  };

  /**
   * @brief Remove a recent channel
   *
   * Removes a recent channel from the list of recents.
   *
   * @param channel The channel name
   * @param platform The platform
   * @return void
   */
  const removeRecent = (channel: string, platform: Platform) => {
    recents.value = recents.value.filter(
      (r) =>
        !(
          r.channel.toLowerCase() === channel.toLowerCase() &&
          r.platform === platform
        ),
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

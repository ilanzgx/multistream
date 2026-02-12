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

  const removeRecent = (channel: string, platform: Platform) => {
    recents.value = recents.value.filter(
      (r) =>
        !(
          r.channel.toLowerCase() === channel.toLowerCase() &&
          r.platform === platform
        ),
    );
  };

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

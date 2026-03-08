import { createSharedComposable, useStorage } from "@vueuse/core";
import { computed } from "vue";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { useRecents } from "./useRecents";

export type Platform = "kick" | "twitch" | "youtube" | "custom";

export interface Stream {
  id: string;
  channel: string;
  platform: Platform;
  iframeUrl?: string;
}

const _useStreams = () => {
  const { t } = useI18n();
  const streams = useStorage<Stream[]>("streams", []);
  const { addRecent } = useRecents();

  /**
   * @brief Add a stream
   *
   * Checks if the stream is already added, showing a warning toast if so.
   * Otherwise, the new entry is appended to the bottom of the list,
   * a success toast is displayed, and it is added to the recent channels list.
   *
   * @param channel The channel name
   * @param platform The platform
   * @param iframeUrl The iframe URL (optional)
   * @return void
   */
  const addStream = (
    channel: string,
    platform: Platform,
    iframeUrl?: string,
  ) => {
    if (
      streams.value.some(
        (s) =>
          s.channel.toLowerCase() === channel.toLowerCase() &&
          s.platform === platform,
      )
    ) {
      toast.warning(t("toasts.add.alreadyAdded"));
      return;
    }

    streams.value = [
      ...streams.value,
      {
        id: crypto.randomUUID(),
        channel,
        platform,
        ...(iframeUrl && { iframeUrl }),
      },
    ];

    toast.success(`${channel} ${t("toasts.add.added")}`);

    addRecent(channel, platform, iframeUrl);
  };

  /**
   * @brief Remove a stream
   *
   * Removes a stream from the list of streams.
   *
   * @param id The stream ID
   * @return void
   */
  const removeStream = (id: string) => {
    const stream = streams.value.find((s) => s.id === id);
    streams.value = streams.value.filter((s) => s.id !== id);

    if (stream) {
      toast.success(`${stream.channel} ${t("toasts.remove")}`);
    }
  };

  /**
   * @brief Clear all streams
   *
   * Clears all streams from the list.
   *
   * @return void
   */
  const clearStreams = () => {
    streams.value = [];
  };

  /**
   * @brief Grid class
   *
   * Returns the grid class based on the number of streams.
   *
   * @return string
   */
  const gridClass = computed(() => {
    const count = streams.value.length;

    if (count === 1) return "grid-cols-1 grid-rows-1";
    if (count === 2) return "grid-cols-1 grid-rows-2";
    if (count === 3) return "grid-cols-2 grid-rows-2";
    if (count === 4) return "grid-cols-2 grid-rows-2";
    if (count <= 6) return "grid-cols-3 grid-rows-2";
    if (count <= 9) return "grid-cols-3 grid-rows-3";

    return "grid-cols-4 grid-rows-3";
  });

  return {
    streams,
    addStream,
    removeStream,
    clearStreams,
    gridClass,
  };
};

export const useStreams = createSharedComposable(_useStreams);

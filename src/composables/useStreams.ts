import { createSharedComposable, useStorage } from "@vueuse/core";
import { computed, reactive } from "vue";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { useRecents } from "./useRecents";
import { useFocusedStream } from "./useFocusedStream";

export type Platform = "kick" | "twitch" | "youtube" | "custom";

const LEAVE_ANIMATION_MS = 250;

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
  const { clearFocus, focusedStreamId } = useFocusedStream();

  // tracks streams currently animating out (two-phase removal)
  // prevents iframe destruction caused by immediate DOM removal/reflow
  const leavingIds = reactive(new Set<string>());

  // tracks reload key suffixes for Kick streams to force re-render/reload when another Kick stream is removed
  const kickReloadCounters = reactive<Record<string, number>>({});


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

    if (streams.value.length >= 12) {
      toast.warning(t("toasts.add.maxStreams"));
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

    if (focusedStreamId.value === id) {
      clearFocus();
    }

    if (stream) {
      toast.success(`${stream.channel} ${t("toasts.remove")}`);

      // If a Kick stream was removed, increment reload counters of remaining Kick streams
      // to trigger an automatic reload of their iframes, restoring audio and process stability.
      if (stream.platform === "kick") {
        streams.value.forEach((s) => {
          if (s.platform === "kick") {
            kickReloadCounters[s.id] = (kickReloadCounters[s.id] || 0) + 1;
          }
        });
      }
    }
  };

  /**
   * @brief Request stream removal with animation
   *
   * Two-phase removal: first marks the stream as "leaving" to trigger
   * a CSS fade-out animation, then removes it from the array after
   * the animation completes. This prevents cross-origin iframes from
   * being destroyed by TransitionGroup DOM manipulation / grid reflow.
   *
   * @param id The stream ID
   * @return void
   */
  const requestRemoveStream = (id: string) => {
    if (leavingIds.has(id)) return;
    leavingIds.add(id);

    setTimeout(() => {
      leavingIds.delete(id);
      removeStream(id);
    }, LEAVE_ANIMATION_MS);
  };

  const isLeaving = (id: string) => leavingIds.has(id);

  /**
   * @brief Get unique Vue render key for a stream
   *
   * For Kick streams, appends a reload counter suffix to force re-rendering/reloading
   * the iframe when another Kick stream has been removed.
   */
  const getStreamKey = (stream: Stream) => {
    if (stream.platform === "kick") {
      const counter = kickReloadCounters[stream.id] || 0;
      return `${stream.id}-kick-${counter}`;
    }
    return stream.id;
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
    leavingIds.clear();
    clearFocus();
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
    requestRemoveStream,
    isLeaving,
    getStreamKey,
    clearStreams,
    gridClass,
  };
};

export const useStreams = createSharedComposable(_useStreams);

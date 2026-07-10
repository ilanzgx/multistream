import { createSharedComposable, useStorage } from "@vueuse/core";
import { computed, reactive, ref, watch, onScopeDispose } from "vue";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { useRecents } from "./useRecents";
import { useFocusedStream } from "./useFocusedStream";
import { useMediaCodecs } from "./useMediaCodecs";
import { useRecording } from "./useRecording";
import { WATCH_TIME_CONFIG } from "@/config/watchTime";

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
  const { checkVideoCodecs } = useMediaCodecs();

  // tracks streams currently animating out (two-phase removal)
  // prevents iframe destruction caused by immediate DOM removal/reflow
  const leavingIds = reactive(new Set<string>());

  // tracks reload key suffixes for Kick streams to force re-render/reload when another Kick stream is removed
  const kickReloadCounters = reactive<Record<string, number>>({});

  // Session watch time tracking
  const sessionStartTimes = reactive<Record<string, number>>({});

  // Reactively track changes to streams to manage session start times (covers additions, removals, and backup imports)
  watch(
    streams,
    (newStreams) => {
      newStreams.forEach((s) => {
        if (!sessionStartTimes[s.id]) {
          sessionStartTimes[s.id] = Date.now();
        }
      });
      const newIds = new Set(newStreams.map((s) => s.id));
      for (const id in sessionStartTimes) {
        if (!newIds.has(id)) {
          delete sessionStartTimes[id];
        }
      }
    },
    { immediate: true, deep: true, flush: "sync" }
  );

  const now = ref(Date.now());

  // Historical watch time tracking
  const watchHistory = useStorage<Record<string, number>>("watch-history", {});
  const memoryAccumulator = reactive<Record<string, number>>({});
  let lastTickTime = Date.now();
  let lastSyncTime = Date.now();

  const flushStreamWatchTime = (stream: Stream) => {
    const key = `${stream.platform}:${stream.channel.toLowerCase()}`;
    const val = memoryAccumulator[key];
    const history = watchHistory.value;
    if (val !== undefined && history) {
      history[key] = (history[key] || 0) + val;
      delete memoryAccumulator[key];
    }
  };

  const flushAllWatchTime = () => {
    const history = watchHistory.value;
    if (!history) return;
    for (const key in memoryAccumulator) {
      const val = memoryAccumulator[key];
      if (val !== undefined) {
        history[key] = (history[key] || 0) + val;
      }
      delete memoryAccumulator[key];
    }
  };

  const tick = (currentNow: number) => {
    now.value = currentNow;

    if (streams.value.length === 0) {
      lastSyncTime = currentNow;
      lastTickTime = currentNow;
      return;
    }

    const delta = Math.max(0, currentNow - lastTickTime);

    streams.value.forEach((s) => {
      // Only accumulate for streams that are not currently animating out/leaving
      if (!leavingIds.has(s.id)) {
        const key = `${s.platform}:${s.channel.toLowerCase()}`;
        memoryAccumulator[key] = (memoryAccumulator[key] || 0) + delta;
      }
    });

    if (currentNow - lastSyncTime >= WATCH_TIME_CONFIG.syncIntervalMs) {
      flushAllWatchTime();
      lastSyncTime = currentNow;
    }

    lastTickTime = currentNow;
  };

  // Single background ticker for both session timer and historical accumulation
  const intervalId = setInterval(() => {
    tick(Date.now());
  }, WATCH_TIME_CONFIG.tickIntervalMs);

  onScopeDispose(() => {
    clearInterval(intervalId);
  });

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
  const addStream = (channel: string, platform: Platform, iframeUrl?: string) => {
    if (
      streams.value.some(
        (s) => s.channel.toLowerCase() === channel.toLowerCase() && s.platform === platform
      )
    ) {
      toast.warning(t("toasts.add.alreadyAdded"));
      return;
    }

    if (streams.value.length >= 12) {
      toast.warning(t("toasts.add.maxStreams"));
      return;
    }

    checkVideoCodecs();

    const newId = crypto.randomUUID();
    streams.value = [
      ...streams.value,
      {
        id: newId,
        channel,
        platform,
        ...(iframeUrl && { iframeUrl }),
      },
    ];

    now.value = Date.now();

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
    if (!stream) return;

    const { isRecording, stopRecording } = useRecording();
    if (isRecording(id)) {
      stopRecording(id);
    }

    streams.value = streams.value.filter((s) => s.id !== id);

    if (focusedStreamId.value === id) {
      clearFocus();
    }

    toast.success(`${stream.channel} ${t("toasts.remove")}`);

    flushStreamWatchTime(stream);
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
   */
  const getStreamKey = (stream: Stream) => stream.id;

  /**
   * @brief Clear all streams
   *
   * Clears all streams from the list.
   *
   * @return void
   */
  const clearStreams = () => {
    flushAllWatchTime();
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

  const resetTimerState = () => {
    lastTickTime = Date.now();
    lastSyncTime = Date.now();
    for (const key in memoryAccumulator) {
      delete memoryAccumulator[key];
    }
  };

  return {
    streams,
    addStream,
    removeStream,
    requestRemoveStream,
    isLeaving,
    getStreamKey,
    clearStreams,
    gridClass,
    sessionStartTimes,
    now,
    watchHistory,
    resetTimerState,
    tick,
  };
};

export const useStreams = createSharedComposable(_useStreams);

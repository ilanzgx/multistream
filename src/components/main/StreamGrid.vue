<script lang="ts" setup>
import KickStream from "@/components/stream/KickStream.vue";
import TwitchStream from "@/components/stream/TwitchStream.vue";
import YoutubeStream from "@/components/stream/YoutubeStream.vue";
import CustomStream from "@/components/stream/CustomStream.vue";
import TranscriptionOverlay from "./TranscriptionOverlay.vue";
import { GripVertical } from "@lucide/vue";
import { useDragAndDrop } from "@/composables/useDragAndDrop";
import { useStreams, type Stream } from "@/composables/useStreams";
import { useFocusedStream } from "@/composables/useFocusedStream";
import { usePreferences } from "@/composables/usePreferences";
import { computed, watch, nextTick, ref } from "vue";
import { useEventListener } from "@vueuse/core";

const { streams, gridClass, isLeaving, getStreamKey } = useStreams();
const { focusedStreamId, isFocused } = useFocusedStream();
const {
  draggingId,
  overId,
  isDragging,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  onMouseUp,
  onGlobalMouseUp,
} = useDragAndDrop();
const { setSelectedChat } = usePreferences();

useEventListener(window, "mouseup", onGlobalMouseUp);

type DomStream = Stream & { _isDead?: boolean };
const domStreams = ref<DomStream[]>([]);

const pauseIframe = (id: string) => {
  const iframe = document.querySelector(`[data-stream-id="${id}"] iframe`) as HTMLIFrameElement;
  if (iframe && iframe.contentWindow) {
    // CRITICAL: DO NOT use the word "pause" in this message type (e.g. MULTISTREAM_GRAVEYARD_PAUSE)!
    // Some injected third-party scripts actively hook window.addEventListener('message')
    // and aggressively drop ANY cross-frame message containing the substring "pause"
    // in its keys/values. If you use "pause", this graveyard mechanism will be
    // completely ignored and the audio will keep playing in the background.
    iframe.contentWindow.postMessage({ type: "MULTISTREAM_GRAVEYARD_SUSPEND" }, "*");
  }
};

watch(
  streams,
  (newStreams) => {
    // 1. Mark removed streams as dead (DO NOT remove from array)
    domStreams.value.forEach((ds) => {
      const isStillAlive = newStreams.some((s) => s.id === ds.id);
      if (!isStillAlive && !ds._isDead) {
        ds._isDead = true;
        pauseIframe(ds.id);
      }
    });

    // 2. Add new streams
    newStreams.forEach((s) => {
      const existing = domStreams.value.find((ds) => ds.id === s.id);
      if (!existing) {
        domStreams.value.push({ ...s, _isDead: false });
      } else if (existing._isDead) {
        // If it was dead and came back (unlikely to have the same ID, but for safety)
        existing._isDead = false;
      }
    });

    // 3. Garbage Collector: Remove dead streams if their platform has NO active streams
    const activePlatforms = new Set(newStreams.map((s) => s.platform));

    domStreams.value = domStreams.value.filter(
      (ds) => !ds._isDead || (ds.platform !== "custom" && activePlatforms.has(ds.platform))
    );
  },
  { deep: true, immediate: true }
);

// auto-select the chat of the focused stream
watch(focusedStreamId, async (newId) => {
  if (!newId) return;
  const stream = streams.value.find((s) => s.id === newId);
  if (stream) setSelectedChat(`${stream.platform}:${stream.channel}`);
});

// FLIP animation: streams physically slide to their new focus positions
watch(focusedStreamId, async () => {
  // 1. FIRST: capture current bounding rect of every stream element
  const elements = document.querySelectorAll<HTMLElement>("[data-stream-id]");
  const prevRects = new Map<string, DOMRect>();
  elements.forEach((el) => {
    prevRects.set(el.dataset.streamId!, el.getBoundingClientRect());
  });

  // 2. Let Vue apply the new grid layout
  await nextTick();

  // 3. LAST + INVERT + PLAY
  elements.forEach((el) => {
    const id = el.dataset.streamId!;
    const prev = prevRects.get(id);
    if (!prev) return;

    const next = el.getBoundingClientRect();
    const dx = prev.left - next.left;
    const dy = prev.top - next.top;
    const scaleX = prev.width / (next.width || 1);
    const scaleY = prev.height / (next.height || 1);

    // Nothing moved — skip
    if (
      Math.abs(dx) < 1 &&
      Math.abs(dy) < 1 &&
      Math.abs(scaleX - 1) < 0.01 &&
      Math.abs(scaleY - 1) < 0.01
    )
      return;

    // Snap element back to its OLD position via inverse transform
    el.style.transition = "none";
    el.style.transformOrigin = "top left";
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;

    // Force paint, then animate to the new (real) position
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = "transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)";
        el.style.transform = "";
      });
    });
  });
});

/**
 * Number of non-focused streams (for grid row calculation in focus mode).
 */
const nonFocusedCount = computed(() => streams.value.filter((s) => !isFocused(s.id)).length);

/**
 * Dynamic inline style for the grid container.
 *
 * In focus mode: CSS Grid with two columns (25% / 75%) and N rows for the
 * side column (one row per non-focused stream). The focused stream spans
 * all rows in column 1.
 *
 * In normal mode: returns an empty object so Tailwind gridClass takes over.
 */
const containerStyle = computed(() => {
  if (!focusedStreamId.value) return {};
  const rows = nonFocusedCount.value || 1;
  return {
    display: "grid",
    gap: "2px",
    gridTemplateColumns: "25% 75%",
    gridTemplateRows: `repeat(${rows}, 1fr)`,
  };
});

/**
 * Returns the inline style for each stream cell.
 *
 * Focused stream  → column 2, spans all rows.
 * Non-focused     → column 1, auto-placed (one per row).
 * Normal mode     → empty object, Tailwind handles it.
 */
const getStreamStyle = (streamId: string) => {
  const index = streams.value.findIndex((s) => s.id === streamId);
  const baseStyle = { order: index };

  if (!focusedStreamId.value) return baseStyle;
  if (isFocused(streamId)) {
    const rows = Math.max(nonFocusedCount.value, 1);
    return {
      ...baseStyle,
      gridColumn: "2",
      gridRow: `1 / ${rows + 1}`,
    };
  }
  return { ...baseStyle, gridColumn: "1" };
};

/**
 * Returns extra classes for each stream cell in normal (non-focus) mode.
 * Handles the 3-stream special case where the last item spans 2 columns.
 */
const getStreamClass = (streamId: string) => {
  if (focusedStreamId.value) return "";
  const index = streams.value.findIndex((s) => s.id === streamId);
  return streams.value.length === 3 && index === 2 ? "col-span-2 justify-self-center w-1/2" : "";
};
</script>

<template>
  <div
    class="h-full overflow-hidden select-none"
    :class="!focusedStreamId ? ['grid', gridClass, 'gap-0.5'] : ''"
    :style="containerStyle"
  >
    <div
      v-for="stream in domStreams"
      v-show="!stream._isDead"
      :key="getStreamKey(stream)"
      :data-stream-id="stream.id"
      :data-testid="`stream-item-${stream.channel}`"
      :style="getStreamStyle(stream.id)"
      :class="[
        getStreamClass(stream.id),
        'min-h-0 min-w-0 stream-item overflow-hidden rounded-sm relative group/grid-item',
        isLeaving(stream.id) ? 'stream-leaving' : '',
        draggingId === stream.id ? 'opacity-50' : '',
      ]"
      @mouseenter="onMouseEnter(stream.id)"
      @mouseleave="onMouseLeave"
      @mouseup="onMouseUp(stream.id)"
    >
      <div
        v-if="isDragging"
        :class="[
          'absolute inset-0 z-40 transition-colors',
          overId === stream.id && draggingId !== stream.id
            ? 'bg-blue-500/10 ring-2 ring-blue-500'
            : 'bg-transparent',
        ]"
      />

      <div
        :class="[
          'absolute z-50 opacity-0 group-hover/grid-item:opacity-100 transition-opacity cursor-grab p-1.5 rounded-md bg-black/60 border border-white/10 hover:bg-black/80 text-white/50 hover:text-white',
          focusedStreamId && !isFocused(stream.id)
            ? 'top-1 left-1/2 -translate-x-1/2 scale-90'
            : 'top-3 left-1/2 -translate-x-1/2',
          isDragging ? 'cursor-grabbing' : '',
        ]"
        @mousedown.stop="onMouseDown(stream.id)"
      >
        <GripVertical class="size-4 pointer-events-none" />
      </div>

      <TranscriptionOverlay v-if="isFocused(stream.id) || streams.length === 1" />

      <KickStream
        v-if="stream.platform === 'kick'"
        :channel="stream.channel"
        :channelid="stream.id"
      />
      <TwitchStream
        v-else-if="stream.platform === 'twitch'"
        :channel="stream.channel"
        :channelid="stream.id"
      />
      <YoutubeStream
        v-else-if="stream.platform === 'youtube'"
        :channel="stream.channel"
        :channelid="stream.id"
      />
      <CustomStream
        v-else-if="stream.platform === 'custom'"
        :channel="stream.channel"
        :channelid="stream.id"
        :iframe-url="stream.iframeUrl || ''"
      />
    </div>
  </div>
</template>
<style scoped>
/* Stream enter animation — plays once when the element is inserted */
.stream-item {
  animation: stream-enter 0.35s ease;
  transition:
    grid-column 0.45s cubic-bezier(0.25, 0.8, 0.25, 1),
    grid-row 0.45s cubic-bezier(0.25, 0.8, 0.25, 1);
}

/* Stream leave animation — two-phase: fade out in place, then remove from DOM */
.stream-leaving {
  opacity: 0;
  transform: scale(0.95);
  pointer-events: none;
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

@keyframes stream-enter {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
}
</style>

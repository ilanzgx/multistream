<script lang="ts" setup>
import KickStream from "@/components/stream/KickStream.vue";
import TwitchStream from "@/components/stream/TwitchStream.vue";
import YoutubeStream from "@/components/stream/YoutubeStream.vue";
import CustomStream from "@/components/stream/CustomStream.vue";
import { useStreams } from "@/composables/useStreams";
import { useFocusedStream } from "@/composables/useFocusedStream";
import { usePreferences } from "@/composables/usePreferences";
import { computed, watch, nextTick } from "vue";

const { streams, gridClass } = useStreams();
const { focusedStreamId, isFocused, clearFocus } = useFocusedStream();
const { setSelectedChat } = usePreferences();

// if the focused stream is removed, clear focus
watch(streams, (newStreams) => {
  if (
    focusedStreamId.value &&
    !newStreams.some((s) => s.id === focusedStreamId.value)
  ) {
    clearFocus();
  }
});

// auto-select the chat of the focused stream
watch(focusedStreamId, async (newId) => {
  if (!newId) return;
  const stream = streams.value.find((s) => s.id === newId);
  if (stream) setSelectedChat(stream.channel);
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
const nonFocusedCount = computed(
  () => streams.value.filter((s) => !isFocused(s.id)).length,
);

/**
 * Dynamic inline style for the grid container.
 *
 * In focus mode: CSS Grid with two columns (60% / 40%) and N rows for the
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
    gridTemplateColumns: "40% 60%",
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
  if (!focusedStreamId.value) return {};
  if (isFocused(streamId)) {
    return {
      gridColumn: "2",
      gridRow: `1 / ${nonFocusedCount.value + 1}`,
    };
  }
  return { gridColumn: "1" };
};

/**
 * Returns extra classes for each stream cell in normal (non-focus) mode.
 * Handles the 3-stream special case where the last item spans 2 columns.
 */
const getStreamClass = (index: number) => {
  if (focusedStreamId.value) return "";
  return streams.value.length === 3 && index === 2
    ? "col-span-2 justify-self-center w-1/2"
    : "";
};
</script>

<template>
  <TransitionGroup
    tag="div"
    name="stream"
    class="h-full"
    :class="!focusedStreamId ? ['grid', gridClass] : ''"
    :style="containerStyle"
  >
    <div
      v-for="(stream, index) in streams"
      :key="stream.id"
      :data-stream-id="stream.id"
      :style="getStreamStyle(stream.id)"
      :class="[getStreamClass(index), 'min-h-0 min-w-0 stream-item']"
    >
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
        :iframeUrl="stream.iframeUrl || ''"
      />
    </div>
  </TransitionGroup>
</template>

<style scoped>
/* Stream add/remove animations */
.stream-enter-active {
  transition:
    opacity 0.35s ease,
    transform 0.35s ease;
}
.stream-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
  position: absolute;
  width: 100%;
  height: 100%;
}
.stream-enter-from {
  opacity: 0;
  transform: scale(0.95);
}
.stream-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* Focus mode layout transition */
:deep(.stream-item) {
  transition:
    grid-column 0.45s cubic-bezier(0.25, 0.8, 0.25, 1),
    grid-row 0.45s cubic-bezier(0.25, 0.8, 0.25, 1);
}
</style>

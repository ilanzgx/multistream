<script lang="ts" setup>
import KickStream from "@/components/stream/KickStream.vue";
import TwitchStream from "@/components/stream/TwitchStream.vue";
import YoutubeStream from "@/components/stream/YoutubeStream.vue";
import CustomStream from "@/components/stream/CustomStream.vue";
import { useStreams } from "@/composables/useStreams";
import { useFocusedStream } from "@/composables/useFocusedStream";
import { computed, watch } from "vue";

const { streams, gridClass } = useStreams();
const { focusedStreamId, isFocused, clearFocus } = useFocusedStream();

// if the focused stream is removed, clear focus
watch(streams, (newStreams) => {
  if (
    focusedStreamId.value &&
    !newStreams.some((s) => s.id === focusedStreamId.value)
  ) {
    clearFocus();
  }
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
  <div
    class="h-full"
    :class="!focusedStreamId ? ['grid', gridClass] : ''"
    :style="containerStyle"
  >
    <template v-for="(stream, index) in streams" :key="stream.id">
      <div
        :style="getStreamStyle(stream.id)"
        :class="[getStreamClass(index), 'min-h-0 min-w-0']"
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
    </template>
  </div>
</template>

<script lang="ts" setup>
import { useStreams } from "@/composables/useStreams";
import { useLiveStatus } from "@/composables/useLiveStatus";
import { PLATFORMS } from "@/config/platforms";

const { addStream } = useStreams();
const { suggestedStreams, isLoadingSuggestions } = useLiveStatus();

// format views for more than 3 digits
// this maybe should be in the some utils folder
const formatViewers = (count?: number) => {
  if (!count) return "";
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
};
</script>

<template>
  <div
    v-if="suggestedStreams.length && !isLoadingSuggestions"
    class="mt-6 flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full max-w-5xl md:max-w-6xl lg:max-w-8xl"
  >
    <div
      class="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-widest select-none"
    >
      <span class="w-8 h-px bg-gray-700"></span>
      {{ $t("add.suggestions") }}
      <span class="w-8 h-px bg-gray-700"></span>
    </div>

    <div class="flex flex-wrap justify-center gap-4 w-full">
      <button
        v-for="stream in suggestedStreams"
        :key="`${stream.platform}:${stream.channel}`"
        class="group relative flex flex-col w-40 overflow-hidden rounded-xl bg-[#14161a] border border-[#2a2d33] transition-all duration-300 hover:border-[#3a3f4b] hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50 cursor-pointer text-left"
        @click="addStream(stream.channel, stream.platform)"
      >
        <!-- Thumbnail -->
        <div class="relative aspect-video w-full bg-[#0f1115] overflow-hidden">
          <img
            v-if="stream.thumbnail"
            :src="
              stream.thumbnail
                .replace('{width}', '640')
                .replace('{height}', '360')
            "
            class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-90 group-hover:opacity-100"
            alt=""
          />
          <!-- Gradient Overlay -->
          <div
            class="absolute inset-0 bg-linear-to-t from-[#14161a] via-transparent to-transparent opacity-80"
          ></div>

          <!-- Live Badge -->
          <div
            class="absolute top-2 left-2 flex items-center gap-1.5 px-1 rounded bg-red-600 shadow-lg shadow-red-900/20"
          >
            <span class="relative flex h-2 w-2">
              <span
                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"
              ></span>
              <span
                class="relative inline-flex rounded-full h-2 w-2 bg-white"
              ></span>
            </span>
            <span class="text-[10px] font-bold text-white tracking-wide"
              >LIVE</span
            >
          </div>

          <!-- Viewers -->
          <div
            class="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 text-[11px] font-medium text-white/90 tabular-nums"
          >
            {{ formatViewers(stream.viewerCount) }} viewers
          </div>
        </div>

        <!-- Info -->
        <div class="p-3 pt-2 flex flex-col gap-0.5 relative z-10">
          <div class="flex items-center justify-between gap-2">
            <span
              class="text-xs font-bold text-white truncate max-w-28"
              :title="stream.channel"
              >{{ stream.channel }}</span
            >
            <component
              v-if="PLATFORMS[stream.platform]"
              :is="PLATFORMS[stream.platform]?.icon"
              :size="16"
              :style="{ color: PLATFORMS[stream.platform]?.color }"
            />
          </div>
          <p class="text-xs text-gray-400 truncate" :title="stream.category">
            {{ stream.category }}
          </p>
          <p
            class="text-[11px] text-gray-500 truncate mt-1 group-hover:text-gray-300 transition-colors"
            :title="stream.title"
          >
            {{ stream.title }}
          </p>
        </div>
      </button>
    </div>
  </div>
</template>

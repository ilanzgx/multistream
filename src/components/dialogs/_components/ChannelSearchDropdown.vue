<script setup lang="ts">
import { PLATFORMS } from "@/config/platforms";
import type { ChannelSearchResult } from "@/composables/useChannelSearch";

const props = defineProps<{
  results: ChannelSearchResult[];
  isLoading: boolean;
  activeIndex: number;
}>();

const emit = defineEmits<{
  (e: "select", result: ChannelSearchResult): void;
  (e: "highlight", index: number): void;
}>();
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-150 ease-out"
    enter-from-class="opacity-0 -translate-y-1 scale-[0.98]"
    enter-to-class="opacity-100 translate-y-0 scale-100"
    leave-active-class="transition-all duration-100 ease-in"
    leave-from-class="opacity-100 translate-y-0 scale-100"
    leave-to-class="opacity-0 -translate-y-1 scale-[0.98]"
  >
    <div
      v-if="isLoading || results.length > 0"
      class="absolute left-0 right-0 top-[calc(100%+4px)] z-50 rounded-lg border border-[#2a2d33] bg-[#0f1115] shadow-xl overflow-hidden"
      role="listbox"
    >
      <!-- Loading skeletons -->
      <template v-if="isLoading && results.length === 0">
        <div
          v-for="i in 3"
          :key="i"
          class="flex items-center gap-3 px-3 py-2.5 border-b border-[#1a1d21] last:border-0"
        >
          <div class="h-3.5 w-3.5 rounded-full bg-[#2a2d33] animate-pulse shrink-0" />
          <div class="h-3 flex-1 rounded bg-[#2a2d33] animate-pulse" />
          <div class="h-3 w-16 rounded bg-[#2a2d33] animate-pulse" />
        </div>
      </template>

      <!-- Results -->
      <template v-else>
        <button
          v-for="(result, index) in results"
          :key="`${result.platform}:${result.channel}`"
          type="button"
          role="option"
          :aria-selected="index === activeIndex"
          class="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100 cursor-pointer border-b border-[#1a1d21] last:border-0 focus:outline-none"
          :class="[
            index === activeIndex
              ? 'bg-[#1a1d21] text-white'
              : 'text-gray-300 hover:bg-[#1a1d21] hover:text-white',
          ]"
          @mousedown.prevent="emit('select', result)"
          @mouseenter="emit('highlight', index)"
        >
          <!-- Platform icon -->
          <component
            :is="PLATFORMS[result.platform]?.icon"
            :size="14"
            class="shrink-0"
            :style="{ color: PLATFORMS[result.platform]?.color }"
          />

          <!-- Channel name -->
          <span class="text-sm font-medium truncate flex-1">{{ result.channel }}</span>

          <!-- Live badge -->
          <span v-if="result.isLive" class="flex items-center gap-1.5 shrink-0">
            <span class="relative flex h-1.5 w-1.5">
              <span
                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"
              />
              <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
            </span>
            <span class="text-[10px] font-semibold uppercase tracking-wide text-red-400">Live</span>
          </span>

          <!-- Category (shown when live) -->
          <span
            v-if="result.isLive && result.category"
            class="text-[10px] text-gray-400 truncate max-w-20 shrink-0"
          >
            {{ result.category }}
          </span>
        </button>
      </template>
    </div>
  </Transition>
</template>

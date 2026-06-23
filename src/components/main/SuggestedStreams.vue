<script lang="ts" setup>
import { ref, computed, watch } from "vue";
import { useStreams } from "@/composables/useStreams";
import { useLiveStatus } from "@/composables/useLiveStatus";
import type { SuggestedStream } from "@/composables/useLiveStatus";
import { PLATFORMS } from "@/config/platforms";
import {
  Pagination,
  PaginationContent,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";

const { addStream } = useStreams();
const { suggestedStreams, isLoadingSuggestions, fetchStreamsForCategory } = useLiveStatus();

const PAGE_SIZE = 18;
const currentPage = ref(1);
const selectedCategory = ref<string | null>(null);

// On-demand streams fetched per category, accumulated across clicks.
// Keyed by "platform:channel" so duplicates are naturally avoided.
// Persists when going back to "All" so those streams remain visible.
const extraStreams = ref<Map<string, SuggestedStream>>(new Map());
const isLoadingCategoryStreams = ref(false);
let fetchVersion = 0;

// Unified list: base suggestions + every on-demand stream ever fetched,
// with the base taking precedence to avoid duplicating fresh data.
const allStreams = computed(() => {
  const map = new Map<string, SuggestedStream>(
    suggestedStreams.value.map((s) => [`${s.platform}:${s.channel}`, s])
  );
  for (const [key, stream] of extraStreams.value) {
    if (!map.has(key)) map.set(key, stream);
  }
  return [...map.values()];
});

// Categories sorted by frequency, derived from the full allStreams list
// so on-demand fetched categories also appear as chips.
const availableCategories = computed(() => {
  const freq = new Map<string, number>();
  for (const stream of allStreams.value) {
    if (!stream.category) continue;
    freq.set(stream.category, (freq.get(stream.category) ?? 0) + 1);
  }
  return [...freq.entries()].toSorted((a, b) => b[1] - a[1]).map(([category]) => category);
});

// Cap the "All" view so pagination doesn't explode after many on-demand loads.
// Category-filtered views are uncapped — you always see everything fetched for that category.
const ALL_MODE_CAP = 200;

const filteredStreams = computed(() => {
  if (!selectedCategory.value) return allStreams.value.slice(0, ALL_MODE_CAP);
  return allStreams.value.filter((s) => s.category === selectedCategory.value);
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredStreams.value.length / PAGE_SIZE)));

const paginatedStreams = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return filteredStreams.value.slice(start, start + PAGE_SIZE);
});

// Reset to page 1 only on full reload (not background updates)
watch(isLoadingSuggestions, (newVal) => {
  if (newVal) {
    currentPage.value = 1;
  }
});

// Clamp currentPage to valid range after re-interleaving or filter change
watch([totalPages, selectedCategory], ([newTotal]) => {
  if (currentPage.value > newTotal) {
    currentPage.value = newTotal;
  }
});

async function selectCategory(category: string | null) {
  selectedCategory.value = category;
  currentPage.value = 1;

  if (!category) {
    isLoadingCategoryStreams.value = false;
    return;
  }

  // Version guard: if the user clicks another chip before this fetch
  // completes, the stale result is discarded.
  const version = ++fetchVersion;
  isLoadingCategoryStreams.value = true;

  try {
    const results = await fetchStreamsForCategory(category);

    if (version !== fetchVersion) return;

    // Normalize the category field to the chip label.
    // Twitch may return streams under a different canonical name
    // (e.g. "Counter-Strike" for the "Counter-Strike 2" chip from Kick).
    // Overriding ensures they show under the correct chip and don't
    // create phantom extra chips in availableCategories.
    for (const stream of results) {
      stream.category = category;
    }

    // Merge new streams into the persistent extra map
    const updated = new Map(extraStreams.value);
    for (const stream of results) {
      const key = `${stream.platform}:${stream.channel}`;
      if (!updated.has(key)) updated.set(key, stream);
    }
    extraStreams.value = updated;
  } finally {
    if (version === fetchVersion) isLoadingCategoryStreams.value = false;
  }
}

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
      class="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-widest select-none"
    >
      <span class="w-8 h-px bg-gray-700" />
      {{ $t("add.suggestions") }}
      <span class="w-8 h-px bg-gray-700" />
    </div>

    <!-- Category filter chips -->
    <div
      v-if="availableCategories.length > 1"
      class="flex gap-2 overflow-x-auto w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        class="flex-none px-3 py-1 rounded-full text-xs font-medium border transition-colors duration-150 cursor-pointer"
        :class="
          selectedCategory === null
            ? 'bg-white/10 text-white border-white/20'
            : 'text-gray-400 border-[#2a2d33] bg-[#14161a] hover:text-white hover:border-[#3a3f4b]'
        "
        @click="selectCategory(null)"
      >
        {{ $t("add.categoryAll") }}
      </button>
      <button
        v-for="category in availableCategories"
        :key="category"
        class="flex-none inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors duration-150 cursor-pointer"
        :class="
          selectedCategory === category
            ? 'bg-white/10 text-white border-white/20'
            : 'text-gray-400 border-[#2a2d33] bg-[#14161a] hover:text-white hover:border-[#3a3f4b]'
        "
        @click="selectCategory(category)"
      >
        {{ category }}
        <!-- Loading spinner shown while fetching this category -->
        <svg
          v-if="selectedCategory === category && isLoadingCategoryStreams"
          class="size-3 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </button>
    </div>

    <div class="flex flex-wrap justify-center gap-4 w-full">
      <button
        v-for="stream in paginatedStreams"
        :key="`${stream.platform}:${stream.channel}`"
        class="group relative flex flex-col w-40 overflow-hidden rounded-xl bg-[#14161a] border border-[#2a2d33] transition-all duration-300 hover:border-[#3a3f4b] hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50 cursor-pointer text-left"
        @click="addStream(stream.channel, stream.platform)"
      >
        <!-- Thumbnail -->
        <div class="relative aspect-video w-full bg-[#0f1115] overflow-hidden">
          <img
            v-if="stream.thumbnail"
            :src="stream.thumbnail.replace('{width}', '640').replace('{height}', '360')"
            class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-90 group-hover:opacity-100"
            alt=""
          />
          <!-- Gradient Overlay -->
          <div
            class="absolute inset-0 bg-linear-to-t from-[#14161a] via-transparent to-transparent opacity-80"
          />

          <!-- Live Badge -->
          <div
            class="absolute top-2 left-2 flex items-center gap-1.5 px-1 rounded bg-red-600 shadow-lg shadow-red-900/20"
          >
            <span class="relative flex h-2 w-2">
              <span
                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"
              />
              <span class="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            <span class="text-[10px] font-bold text-white tracking-wide">LIVE</span>
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
            <span class="text-xs font-bold text-white truncate max-w-28" :title="stream.channel">{{
              stream.channel
            }}</span>
            <component
              :is="PLATFORMS[stream.platform]?.icon"
              v-if="PLATFORMS[stream.platform]"
              :size="16"
              :style="{ color: PLATFORMS[stream.platform]?.color }"
            />
          </div>
          <p class="text-xs text-gray-400 truncate" :title="stream.category">
            {{ stream.category }}
          </p>
          <p
            class="text-[11px] text-gray-400 truncate mt-1 group-hover:text-gray-300 transition-colors"
            :title="stream.title"
          >
            {{ stream.title }}
          </p>
        </div>
      </button>
    </div>

    <!-- Pagination -->
    <Pagination
      v-if="totalPages > 1"
      v-model:page="currentPage"
      :total="filteredStreams.length"
      :items-per-page="PAGE_SIZE"
      :sibling-count="1"
      class="mt-2"
    >
      <PaginationContent class="flex items-center gap-1">
        <PaginationPrevious
          class="size-8 p-0 flex items-center justify-center text-gray-400 hover:text-white bg-[#14161a] border border-[#2a2d33] hover:bg-[#1a1d21] hover:border-[#3a3f4b] rounded-lg transition-colors cursor-pointer"
        >
          <ChevronLeft class="size-4" />
        </PaginationPrevious>

        <button
          v-for="page in totalPages"
          :key="page"
          class="size-8 flex items-center justify-center rounded-lg text-xs font-medium transition-colors border cursor-pointer"
          :class="[
            page === currentPage
              ? 'bg-white/10 text-white border-white/20'
              : 'text-gray-400 hover:text-white bg-[#14161a] border-[#2a2d33] hover:bg-[#1a1d21] hover:border-[#3a3f4b]',
          ]"
          @click="currentPage = page"
        >
          {{ page }}
        </button>

        <PaginationNext
          class="size-8 p-0 flex items-center justify-center text-gray-400 hover:text-white bg-[#14161a] border border-[#2a2d33] hover:bg-[#1a1d21] hover:border-[#3a3f4b] rounded-lg transition-colors cursor-pointer"
        >
          <ChevronRight class="size-4" />
        </PaginationNext>
      </PaginationContent>
    </Pagination>
  </div>
</template>

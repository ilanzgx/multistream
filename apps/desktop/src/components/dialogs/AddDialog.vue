<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import StreamChip from "./_components/StreamChip.vue";
import ChannelSearchDropdown from "./_components/ChannelSearchDropdown.vue";
import { useStreams, type Platform } from "@/composables/useStreams";
import { useRecents } from "@/composables/useRecents";
import { useLiveStatus, type SuggestedStream } from "@/composables/useLiveStatus";
import { useFavorites } from "@/composables/useFavorites";
import { useChannelSearch } from "@/composables/useChannelSearch";
import { PLATFORMS } from "@/config/platforms";
import { History, Heart, Flame, RotateCw, Loader2 } from "@lucide/vue";
import { parseStreamUrl } from "@/lib/platformParser";

// props
const props = defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { addStream } = useStreams();
const { recents, removeRecent } = useRecents();
const {
  getStatus,
  checkAll,
  suggestedStreams,
  isLoadingSuggestions,
  refreshSuggestions,
  fetchStreamsForCategory,
} = useLiveStatus();
const { favorites, removeFavorite } = useFavorites();
const { t, locale } = useI18n();

const sortedFavorites = computed(() => {
  return [...favorites.value].toSorted((a, b) => {
    const statusA = getStatus(a.channel, a.platform);
    const statusB = getStatus(b.channel, b.platform);

    const aLive = statusA?.isLive;
    const bLive = statusB?.isLive;

    // sort by live status
    if (aLive && !bLive) return -1;
    if (!aLive && bLive) return 1;

    // sort by viewers count
    if (aLive && bLive) {
      const viewersA = statusA?.viewerCount ?? 0;
      const viewersB = statusB?.viewerCount ?? 0;
      if (viewersA !== viewersB) {
        return viewersB - viewersA;
      }
    }

    // fallback to alphabetical sort
    return a.channel.localeCompare(b.channel);
  });
});

// Suggestions filtering & categories
const selectedCategory = ref<string | null>(null);
const isLoadingCategory = ref(false);
const extraCategoryStreams = ref<Map<string, SuggestedStream>>(new Map());

const allSuggestions = computed(() => {
  const map = new Map<string, SuggestedStream>(
    suggestedStreams.value.map((s) => [`${s.platform}:${s.channel}`, s])
  );
  for (const [key, stream] of extraCategoryStreams.value) {
    if (!map.has(key)) map.set(key, stream);
  }
  return [...map.values()];
});

const availableCategories = computed(() => {
  const freq = new Map<string, number>();
  for (const stream of allSuggestions.value) {
    if (!stream.category) continue;
    freq.set(stream.category, (freq.get(stream.category) ?? 0) + 1);
  }
  return [...freq.entries()].toSorted((a, b) => b[1] - a[1]).map(([category]) => category);
});

const filteredSuggestions = computed(() => {
  const list = !selectedCategory.value
    ? allSuggestions.value
    : allSuggestions.value.filter((s) => s.category === selectedCategory.value);
  return list.toSorted((a, b) => (b.viewerCount ?? 0) - (a.viewerCount ?? 0));
});

const displayedSuggestions = computed(() => filteredSuggestions.value.slice(0, 24));

const failedThumbnails = ref<Set<string>>(new Set());
const handleThumbnailError = (key: string) => {
  failedThumbnails.value.add(key);
};

const selectCategory = async (category: string | null) => {
  selectedCategory.value = category;
  if (!category) return;
  isLoadingCategory.value = true;
  try {
    const results = await fetchStreamsForCategory(category);
    for (const s of results) {
      extraCategoryStreams.value.set(`${s.platform}:${s.channel}`, s);
    }
  } finally {
    isLoadingCategory.value = false;
  }
};

const formatViewers = (count?: number): string => {
  if (count === undefined || count === null) return "";
  return new Intl.NumberFormat(locale.value, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
};

// local state
const channelName = ref("");
const iframeUrl = ref("");
const selectedPlatform = ref<Platform>(PLATFORMS.twitch!.id as Platform);

const isCustom = computed(() => selectedPlatform.value === "custom");

const customNameInput = ref<HTMLInputElement | null>(null);

// autocomplete
const {
  results: searchResults,
  isLoading: isSearching,
  clear: clearSearch,
} = useChannelSearch().search(channelName, selectedPlatform);

const activeSearchIndex = ref(-1);
const isDropdownOpen = computed(
  () =>
    !isCustom.value &&
    (selectedPlatform.value === "twitch" || selectedPlatform.value === "kick") &&
    (isSearching.value || searchResults.value.length > 0)
);

const selectSearchResult = (result: { channel: string }) => {
  channelName.value = result.channel;
  clearSearch();
  activeSearchIndex.value = -1;
};

const handleSearchKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const selected =
      isDropdownOpen.value && activeSearchIndex.value >= 0
        ? searchResults.value[activeSearchIndex.value]
        : undefined;
    if (selected) {
      selectSearchResult(selected);
    } else {
      handleAddStream();
    }
    return;
  }

  if (!isDropdownOpen.value) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeSearchIndex.value = Math.min(activeSearchIndex.value + 1, searchResults.value.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeSearchIndex.value = Math.max(activeSearchIndex.value - 1, -1);
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    clearSearch();
    activeSearchIndex.value = -1;
  }
};

watch(searchResults, () => {
  activeSearchIndex.value = -1;
});

const handleChannelBlur = () => {
  // Delay so mousedown on a dropdown item fires before blur clears results
  setTimeout(() => {
    clearSearch();
    activeSearchIndex.value = -1;
    if (channelName.value) {
      detectAndApply(channelName.value);
    }
  }, 150);
};

const detectAndApply = async (value: string) => {
  const result = parseStreamUrl(value);
  if (!result) return false;

  selectedPlatform.value = result.platform;

  if (result.platform === "custom") {
    iframeUrl.value = result.iframeUrl || "";
    channelName.value = "";
    await nextTick();
    customNameInput.value?.focus();
  } else {
    channelName.value = result.channel;
  }
  return true;
};

const handlePaste = (e: ClipboardEvent) => {
  const pastedText = e.clipboardData?.getData("text") || "";
  const result = parseStreamUrl(pastedText);
  if (result) {
    e.preventDefault();
    detectAndApply(pastedText);
  }
};

const handleIframePaste = (e: ClipboardEvent) => {
  const pastedText = e.clipboardData?.getData("text") || "";
  const result = parseStreamUrl(pastedText);
  if (result && result.platform !== "custom") {
    e.preventDefault();
    detectAndApply(pastedText);
  }
};

const handleIframeBlur = () => {
  if (iframeUrl.value) {
    const result = parseStreamUrl(iframeUrl.value);
    if (result && result.platform !== "custom") {
      detectAndApply(iframeUrl.value);
    }
  }
};

const handleAddStream = () => {
  if (!canSubmit.value) return;

  // Close any open autocomplete dropdown
  clearSearch();
  activeSearchIndex.value = -1;

  if (isCustom.value) {
    let url = iframeUrl.value.trim();
    const name = channelName.value.trim() || t("add.customStreamDefault");

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }

    addStream(name, "custom", url);
    channelName.value = "";
    iframeUrl.value = "";
    selectedPlatform.value = PLATFORMS.twitch!.id as Platform;
    emit("update:open", false);
    return;
  }

  let channel = channelName.value.trim();

  const parsedResult = parseStreamUrl(channel);
  if (parsedResult) {
    selectedPlatform.value = parsedResult.platform;
    if (parsedResult.platform === "custom") {
      let url = parsedResult.iframeUrl || "";
      const name = t("add.customStreamDefault");
      addStream(name, "custom", url);
      channelName.value = "";
      iframeUrl.value = "";
      selectedPlatform.value = PLATFORMS.twitch!.id as Platform;
      emit("update:open", false);
      return;
    } else {
      channel = parsedResult.channel;
    }
  } else {
    // if not a valid URL, try to extract manually
    const parts = channel.split("/").filter(Boolean);
    channel = parts.pop() || channel;
    channel = channel.split("?")[0] || channel;
  }

  if (!channel) {
    return;
  }

  addStream(channel, selectedPlatform.value);

  channelName.value = "";
  selectedPlatform.value = PLATFORMS.twitch!.id as Platform;
  emit("update:open", false);
};

const PLATFORM_ACTIVE_CLASSES: Record<Platform, string> = {
  twitch: "bg-[#9146FF]/10 border-[#9146FF]/50 text-white shadow-xs",
  kick: "bg-[#53FC18]/10 border-[#53FC18]/50 text-white shadow-xs",
  youtube: "bg-[#FF0000]/10 border-[#FF0000]/50 text-white shadow-xs",
  custom: "bg-[#6366F1]/10 border-[#6366F1]/50 text-white shadow-xs",
};

const splitLabel = (label: string) => {
  const match = label.match(/^(.*?)\s*[(（](.*?)[)）]$/);
  if (match) {
    return { main: match[1], sub: match[2] };
  }
  return { main: label, sub: "" };
};

const customNameLabelParts = computed(() => splitLabel(t("add.customNameLabel")));

const isValidCustomUrl = computed(() => {
  const url = iframeUrl.value.trim();
  if (!url) return false;

  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.includes(".")
    );
  } catch {
    return false;
  }
});

const canSubmit = computed(() => {
  if (isCustom.value) {
    return isValidCustomUrl.value;
  }
  return channelName.value.trim().length > 0;
});

const handleQuickAdd = (channel: string, platform: Platform, iframeUrl?: string) => {
  addStream(channel, platform, iframeUrl);
  emit("update:open", false);
};

// Refresh statuses and suggestions when dialog opens
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      checkAll();
      if (suggestedStreams.value.length === 0) {
        refreshSuggestions();
      }
      selectedCategory.value = null;
      failedThumbnails.value.clear();
    } else {
      clearSearch();
      activeSearchIndex.value = -1;
      channelName.value = "";
      iframeUrl.value = "";
      selectedPlatform.value = PLATFORMS.twitch!.id as Platform;
    }
  },
  { immediate: true }
);
</script>

<template>
  <Dialog :open="open" :modal="false" @update:open="emit('update:open', $event)">
    <DialogContent
      class="bg-[#14161a] border-[#262930] w-[95vw] sm:w-[92vw] max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl max-h-[92vh] flex flex-col overflow-hidden p-4 sm:p-6"
    >
      <DialogHeader>
        <DialogTitle class="text-white">
          {{ $t("add.title") }}
        </DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ $t("add.description") }}
        </DialogDescription>
      </DialogHeader>

      <div
        class="space-y-3 sm:space-y-4 flex-1 min-h-0 overflow-y-auto pr-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <!-- add stream manually -->
        <div
          class="flex flex-col gap-4 border border-[#2a2d33]/60 bg-[#14161a] p-3.5 sm:p-4 rounded-xl"
        >
          <!-- platform selector with icons -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-300">{{ $t("add.platform") }}</label>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                v-for="platform in PLATFORMS"
                :key="platform.id"
                type="button"
                class="flex flex-col items-center gap-2 p-2.5 sm:p-3 rounded-lg border transition-colors duration-150 cursor-pointer"
                :class="[
                  selectedPlatform === platform.id
                    ? PLATFORM_ACTIVE_CLASSES[platform.id]
                    : 'bg-[#181a1f] border-[#262930] text-gray-400 hover:bg-[#1f2229] hover:border-[#353943] hover:text-white',
                ]"
                :data-testid="`platform-${platform.id}`"
                @click="selectedPlatform = platform.id as Platform"
              >
                <component
                  :is="platform.icon"
                  :size="22"
                  :style="{ color: platform.color }"
                  class="shrink-0"
                />
                <span class="text-xs font-medium capitalize">{{
                  platform.id === "custom" ? $t("add.platformCustom") : platform.name
                }}</span>
              </button>
            </div>
          </div>

          <!-- custom iframe URL input -->
          <div v-if="isCustom" class="flex flex-col sm:flex-row gap-3 w-full">
            <div class="sm:w-2/3 flex flex-col gap-1.5">
              <label class="block text-sm font-medium text-gray-300">{{
                $t("add.iframeUrlLabel")
              }}</label>
              <div class="relative flex items-center">
                <span
                  class="absolute left-3.5 pointer-events-none text-gray-400 flex items-center justify-center"
                >
                  <component
                    :is="PLATFORMS.custom.icon"
                    :size="15"
                    :style="{ color: PLATFORMS.custom.color }"
                  />
                </span>
                <input
                  v-model="iframeUrl"
                  type="text"
                  :placeholder="$t('add.iframeUrlPlaceholder')"
                  class="w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-[#0f1115] text-white border border-[#262930] text-sm transition-colors duration-150 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 hover:border-[#353943] placeholder:text-gray-400"
                  @keyup.enter="handleAddStream"
                  @paste="handleIframePaste"
                  @blur="handleIframeBlur"
                />
              </div>
            </div>
            <div class="sm:w-1/3 flex flex-col gap-1.5">
              <label class="block text-sm font-medium text-gray-300">
                <span>{{ customNameLabelParts.main }}</span>
                <span
                  v-if="customNameLabelParts.sub"
                  class="text-[10px] text-gray-400 font-normal lowercase tracking-wide shrink-0 ml-2"
                >
                  ({{ customNameLabelParts.sub }})
                </span>
              </label>
              <input
                ref="customNameInput"
                v-model="channelName"
                type="text"
                :placeholder="$t('add.customNamePlaceholder')"
                class="w-full px-3.5 py-2.5 rounded-lg bg-[#0f1115] text-white border border-[#262930] text-sm transition-colors duration-150 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 hover:border-[#353943] placeholder:text-gray-400"
              />
            </div>
          </div>

          <!-- channel name (for non-custom platforms) -->
          <div v-else class="flex flex-col gap-1.5">
            <label
              v-if="selectedPlatform === 'kick' || selectedPlatform === 'twitch'"
              class="block text-sm font-medium text-gray-300"
              >{{ $t("add.channelLabel") }}</label
            >
            <label v-else class="block text-sm font-medium text-gray-300">{{
              $t("add.videoIdLabel")
            }}</label>
            <div class="relative flex items-center">
              <span
                class="absolute left-3.5 pointer-events-none text-gray-400 flex items-center justify-center"
              >
                <component
                  :is="PLATFORMS[selectedPlatform]?.icon"
                  :size="15"
                  :style="{ color: PLATFORMS[selectedPlatform]?.color }"
                />
              </span>
              <input
                v-model="channelName"
                data-testid="channel-input"
                type="text"
                :placeholder="$t('add.placeholder')"
                class="w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-[#0f1115] text-white border border-[#262930] text-sm transition-colors duration-150 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 hover:border-[#353943] placeholder:text-gray-400"
                autocomplete="off"
                @keydown="handleSearchKeydown"
                @paste="handlePaste"
                @blur="handleChannelBlur"
              />
              <ChannelSearchDropdown
                :results="searchResults"
                :is-loading="isSearching"
                :active-index="activeSearchIndex"
                @select="selectSearchResult"
                @highlight="activeSearchIndex = $event"
              />
            </div>
          </div>
        </div>

        <!-- 2-column layout: Left (62%) = History & Favorites, Right (38%) = Suggested Streams -->
        <div class="flex flex-col lg:flex-row gap-4">
          <!-- Left column: History and Favorites (62% on lg+, full width on mobile/tablet) -->
          <div class="w-full lg:w-[62%] flex flex-col gap-3 min-w-0">
            <!-- recent channels (4 items per row) -->
            <div v-if="recents.length" class="space-y-2">
              <div class="flex items-center gap-2 px-1">
                <History class="size-4 text-gray-400 shrink-0" />
                <div>
                  <h3 class="text-white text-sm font-medium">
                    {{ $t("add.historyLabel") }}
                  </h3>
                  <p class="text-gray-400 text-xs">
                    {{ $t("add.recents") }}
                  </p>
                </div>
              </div>
              <div class="border border-[#2a2d33]/60 bg-[#14161a] p-2.5 rounded-xl">
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                  <StreamChip
                    v-for="recent in recents"
                    :key="`${recent.platform}:${recent.channel}`"
                    :channel="recent.channel"
                    :platform="recent.platform"
                    class="w-full"
                    @click="handleQuickAdd(recent.channel, recent.platform, recent.iframeUrl)"
                    @remove="removeRecent(recent.channel, recent.platform)"
                  />
                </div>
              </div>
            </div>

            <!-- favorites (4 items per row) -->
            <div v-if="sortedFavorites.length" class="space-y-2 flex-1 flex flex-col min-w-0">
              <div class="flex items-center gap-2 px-1">
                <Heart class="size-4 text-gray-400 shrink-0" />
                <div>
                  <h3 class="text-white text-sm font-medium">
                    {{ $t("add.favoritesLabel") }}
                  </h3>
                  <p class="text-gray-400 text-xs">
                    {{ $t("add.favoritesDescription") }}
                  </p>
                </div>
              </div>
              <div
                class="border border-[#2a2d33]/60 bg-[#14161a] p-2.5 rounded-xl flex-1 flex flex-col min-h-0"
              >
                <div
                  class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 content-start items-start overflow-y-auto flex-1 max-h-[160px] sm:max-h-[180px] lg:max-h-[220px] pr-1 py-0.5 overflow-x-hidden scrollbar-thin"
                >
                  <StreamChip
                    v-for="favorite in sortedFavorites"
                    :key="`${favorite.platform}:${favorite.channel}`"
                    :channel="favorite.channel"
                    :platform="favorite.platform"
                    class="w-full"
                    @click="handleQuickAdd(favorite.channel, favorite.platform)"
                    @remove="removeFavorite(favorite.channel, favorite.platform)"
                  />
                </div>
              </div>
            </div>

            <!-- empty state when no recents and no favorites -->
            <div
              v-if="!recents.length && !sortedFavorites.length"
              class="border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl flex-1 flex flex-col items-center justify-center text-center py-8"
            >
              <Heart class="size-6 text-gray-600 mb-2" />
              <p class="text-gray-400 text-xs font-medium">{{ $t("add.favoritesDescription") }}</p>
            </div>
          </div>

          <!-- Right column: Suggested Streams (38% on lg+, full width on mobile/tablet) -->
          <div class="w-full lg:w-[38%] flex flex-col space-y-2 min-w-0">
            <div class="flex items-center justify-between px-1">
              <div class="flex items-center gap-2 min-w-0">
                <Flame class="size-4 text-gray-400 shrink-0" />
                <div class="min-w-0">
                  <h3 class="text-white text-sm font-medium truncate">
                    {{ $t("add.suggestedLabel") }}
                  </h3>
                  <p class="text-gray-400 text-xs truncate">
                    {{ $t("add.suggestedDescription") }}
                  </p>
                </div>
              </div>
              <button
                v-if="!isLoadingSuggestions"
                type="button"
                class="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                :title="$t('empty.refresh')"
                @click="refreshSuggestions"
              >
                <RotateCw class="size-3.5" />
              </button>
              <Loader2 v-else class="size-3.5 text-gray-400 animate-spin shrink-0" />
            </div>

            <!-- Category filter chips -->
            <div
              v-if="availableCategories.length > 1"
              class="flex gap-1.5 overflow-x-auto w-full pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              <button
                type="button"
                class="flex-none px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors duration-150 cursor-pointer"
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
                v-for="category in availableCategories.slice(0, 10)"
                :key="category"
                type="button"
                class="flex-none inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors duration-150 cursor-pointer"
                :class="
                  selectedCategory === category
                    ? 'bg-white/10 text-white border-white/20'
                    : 'text-gray-400 border-[#2a2d33] bg-[#14161a] hover:text-white hover:border-[#3a3f4b]'
                "
                @click="selectCategory(category)"
              >
                {{ category }}
                <Loader2
                  v-if="selectedCategory === category && isLoadingCategory"
                  class="size-2.5 animate-spin"
                />
              </button>
            </div>

            <!-- Suggested Streams Grid (Mini Video Cards: 2-3 on desktop, up to 4 on full-width tablet) -->
            <div
              class="border border-[#2a2d33]/60 bg-[#14161a] p-2 rounded-xl flex-1 flex flex-col min-h-[200px]"
            >
              <div
                v-if="displayedSuggestions.length > 0"
                class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3 gap-2 auto-rows-max content-start overflow-y-auto flex-1 max-h-[240px] sm:max-h-[280px] lg:max-h-[320px] p-0.5 pr-1 overflow-x-hidden scrollbar-thin"
              >
                <button
                  v-for="stream in displayedSuggestions"
                  :key="`${stream.platform}:${stream.channel}`"
                  type="button"
                  class="group relative flex flex-col w-full h-auto rounded-lg bg-[#181a1f] border border-[#262930] hover:border-[#3a3f4b] hover:bg-[#1f2229] transition-all duration-200 cursor-pointer text-left overflow-hidden focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                  @click="handleQuickAdd(stream.channel, stream.platform)"
                >
                  <!-- Thumbnail -->
                  <div class="relative aspect-video w-full shrink-0 bg-[#0f1115] overflow-hidden">
                    <img
                      v-if="
                        stream.thumbnail &&
                        !failedThumbnails.has(`${stream.platform}:${stream.channel}`)
                      "
                      :src="stream.thumbnail.replace('{width}', '280').replace('{height}', '158')"
                      class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 opacity-90 group-hover:opacity-100"
                      alt=""
                      loading="lazy"
                      decoding="async"
                      fetchpriority="low"
                      @error="handleThumbnailError(`${stream.platform}:${stream.channel}`)"
                    />
                    <div v-else class="w-full h-full flex items-center justify-center bg-[#0f1115]">
                      <component
                        :is="PLATFORMS[stream.platform]?.icon"
                        :size="16"
                        :style="{ color: PLATFORMS[stream.platform]?.color }"
                        class="opacity-30"
                      />
                    </div>

                    <!-- Gradient Overlay -->
                    <div
                      class="absolute inset-0 bg-linear-to-t from-[#181a1f] via-transparent to-transparent opacity-80"
                    />

                    <!-- Live Badge -->
                    <div
                      class="absolute top-1 left-1 flex items-center gap-0.5 px-1 py-0.2 rounded bg-red-600 shadow-xs"
                    >
                      <span class="size-1 rounded-full bg-white" />
                      <span class="text-[7px] font-bold text-white tracking-wide uppercase">{{
                        $t("nativePlayer.live")
                      }}</span>
                    </div>

                    <!-- Viewers -->
                    <div
                      v-if="stream.viewerCount"
                      class="absolute bottom-1 right-1 px-1.5 py-0.2 rounded bg-black/75 backdrop-blur-xs border border-white/10 text-[8px] font-medium text-white/90 tabular-nums flex items-center gap-0.5"
                    >
                      <span class="size-1 rounded-full bg-rose-500 shrink-0" />
                      {{ formatViewers(stream.viewerCount) }}
                    </div>
                  </div>

                  <!-- Info -->
                  <div class="p-1.5 flex flex-col gap-0.5 relative z-10 min-w-0">
                    <div class="flex items-center justify-between gap-1">
                      <span
                        class="text-[11px] font-semibold text-white truncate"
                        :title="stream.displayName || stream.channel"
                      >
                        {{ stream.displayName || stream.channel }}
                      </span>
                      <component
                        :is="PLATFORMS[stream.platform]?.icon"
                        v-if="PLATFORMS[stream.platform]"
                        :size="10"
                        :style="{ color: PLATFORMS[stream.platform]?.color }"
                        class="shrink-0"
                      />
                    </div>
                    <p
                      v-if="stream.category"
                      class="text-[9px] text-gray-400 truncate"
                      :title="stream.category"
                    >
                      {{ stream.category }}
                    </p>
                    <p
                      v-if="stream.title"
                      class="text-[8px] text-gray-500 truncate group-hover:text-gray-400 transition-colors"
                      :title="stream.title"
                    >
                      {{ stream.title }}
                    </p>
                  </div>
                </button>
              </div>
              <div
                v-else-if="isLoadingSuggestions"
                class="flex flex-col items-center justify-center flex-1 py-8 text-gray-500 gap-2"
              >
                <Loader2 class="size-5 animate-spin text-gray-400" />
                <span class="text-xs">{{ $t("empty.loading") }}</span>
              </div>
              <div
                v-else
                class="flex items-center justify-center flex-1 py-8 text-gray-500 text-xs"
              >
                {{ $t("add.noSuggestions") }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter class="pt-5 border-t border-[#262930]/60">
        <DialogClose as-child>
          <Button
            variant="outline"
            class="border-[#262930] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#353943] transition-colors duration-150"
          >
            {{ $t("common.close") }}
          </Button>
        </DialogClose>
        <Button
          :disabled="!canSubmit"
          data-testid="add-submit-btn"
          class="bg-white text-[#14161a] font-medium border-transparent hover:bg-gray-200 active:scale-[0.98] transition-colors duration-150 disabled:opacity-35 disabled:cursor-not-allowed"
          @click="handleAddStream"
        >
          {{ $t("add.addButton") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

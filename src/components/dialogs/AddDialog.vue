<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
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
import { useLiveStatus } from "@/composables/useLiveStatus";
import { useFavorites } from "@/composables/useFavorites";
import { useChannelSearch } from "@/composables/useChannelSearch";
import { PLATFORMS } from "@/config/platforms";
import { History, Heart } from "lucide-vue-next";
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
const { getStatus, checkAll } = useLiveStatus();
const { favorites, removeFavorite } = useFavorites();

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

// Refresh statuses when dialog opens
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      checkAll();
    }
  }
);

const handleQuickAdd = (channel: string, platform: Platform, iframeUrl?: string) => {
  addStream(channel, platform, iframeUrl);
  emit("update:open", false);
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
} = useChannelSearch(channelName, selectedPlatform);

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
  if (!isDropdownOpen.value) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeSearchIndex.value = Math.min(activeSearchIndex.value + 1, searchResults.value.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeSearchIndex.value = Math.max(activeSearchIndex.value - 1, -1);
  } else if (e.key === "Enter" && activeSearchIndex.value >= 0) {
    e.preventDefault();
    const selected = searchResults.value[activeSearchIndex.value];
    if (selected) selectSearchResult(selected);
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    clearSearch();
    activeSearchIndex.value = -1;
  }
};

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
    const name = channelName.value.trim() || "Custom Stream";

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
      const name = "Custom Stream";
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

const splitLabel = (label: string) => {
  const match = label.match(/^(.*?)\s*\((.*?)\)$/);
  if (match) {
    return { main: match[1], sub: match[2] };
  }
  return { main: label, sub: "" };
};

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
    return isValidCustomUrl.value && channelName.value.trim().length > 0;
  }
  return channelName.value.trim().length > 0;
});
</script>

<template>
  <Dialog :open="open" :modal="false" @update:open="emit('update:open', $event)">
    <DialogContent class="bg-[#14161a] border-[#2a2d33] max-w-xl md:max-w-2xl lg:max-w-3xl">
      <DialogHeader>
        <DialogTitle class="text-white">
          {{ $t("add.title") }}
        </DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ $t("add.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- add stream manually -->
        <div class="flex flex-col gap-4 border border-[#2a2d33] bg-[#14161a] p-4 rounded-xl">
          <!-- platform selector with icons -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-300">{{ $t("add.platform") }}</label>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                v-for="platform in PLATFORMS"
                :key="platform.id"
                type="button"
                class="flex flex-col items-center gap-2 p-3 rounded-lg border transition-all duration-200 cursor-pointer hover:scale-[1.03] active:scale-[0.97]"
                :class="[
                  selectedPlatform === platform.id
                    ? 'bg-[#2a2d33] border-white/20 ring-1 ring-white/10'
                    : 'bg-[#0f1115] border-[#2a2d33] hover:bg-[#1a1d21] hover:border-[#3a3f4b]',
                ]"
                :data-testid="`platform-${platform.id}`"
                @click="selectedPlatform = platform.id as Platform"
              >
                <component :is="platform.icon" :size="24" :style="{ color: platform.color }" />
                <span class="text-xs text-white capitalize">{{ platform.name }}</span>
              </button>
            </div>
          </div>

          <!-- custom iframe URL input -->
          <div v-if="isCustom" class="flex flex-col sm:flex-row gap-2 w-full">
            <div class="sm:w-2/3">
              <label class="text-sm font-medium text-gray-300">{{
                $t("add.iframeUrlLabel")
              }}</label>
              <input
                v-model="iframeUrl"
                type="text"
                :placeholder="$t('add.iframeUrlPlaceholder')"
                class="w-full px-3.5 py-2.5 rounded-lg bg-[#0f1115] text-white border border-[#2a2d33] text-sm transition-all duration-200 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.06)] hover:border-[#3a3f4b] placeholder:text-gray-400"
                @keyup.enter="handleAddStream"
                @paste="handleIframePaste"
                @blur="handleIframeBlur"
              />
            </div>
            <div class="sm:w-1/3">
              <label class="text-sm font-medium text-gray-300">
                <span>{{ splitLabel($t("add.customNameLabel")).main }}</span>
                <span
                  v-if="splitLabel($t('add.customNameLabel')).sub"
                  class="text-[10px] text-gray-400 font-normal lowercase tracking-wide shrink-0 ml-2"
                >
                  ({{ splitLabel($t("add.customNameLabel")).sub }})
                </span>
              </label>
              <input
                ref="customNameInput"
                v-model="channelName"
                type="text"
                :placeholder="$t('add.customNamePlaceholder')"
                class="w-full px-3.5 py-2.5 rounded-lg bg-[#0f1115] text-white border border-[#2a2d33] text-sm transition-all duration-200 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.06)] hover:border-[#3a3f4b] placeholder:text-gray-400"
              />
            </div>
          </div>

          <!-- channel name (for non-custom platforms) -->
          <div v-else class="space-y-2">
            <label
              v-if="selectedPlatform === 'kick' || selectedPlatform === 'twitch'"
              class="text-sm font-medium text-gray-300"
              >{{ $t("add.channelLabel") }}</label
            >
            <label v-else class="text-sm font-medium text-gray-300">{{
              $t("add.videoIdLabel")
            }}</label>
            <div class="relative">
              <input
                v-model="channelName"
                data-testid="channel-input"
                type="text"
                :placeholder="$t('add.placeholder')"
                class="w-full px-3.5 py-2.5 rounded-lg bg-[#0f1115] text-white border border-[#2a2d33] text-sm transition-all duration-200 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.06)] hover:border-[#3a3f4b] placeholder:text-gray-400"
                autocomplete="off"
                @keydown="handleSearchKeydown"
                @keyup.enter="!isDropdownOpen && handleAddStream()"
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

        <!-- recent channels -->
        <section
          v-if="recents.length"
          class="flex flex-col gap-4 border border-[#2a2d33] bg-[#14161a] p-4 rounded-xl"
        >
          <!-- recent title -->
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center size-10 rounded-lg bg-[#14161a] border border-[#2a2d33]"
            >
              <History class="size-5 text-gray-400" />
            </div>
            <div>
              <p class="text-white text-sm font-medium">
                {{ $t("add.historyLabel") }}
              </p>
              <p class="text-xs text-gray-400">
                {{ $t("add.recents") }}
              </p>
            </div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
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
        </section>

        <!-- favorites -->
        <section
          v-if="sortedFavorites.length"
          class="flex flex-col gap-4 border border-[#2a2d33] bg-[#14161a] p-4 rounded-xl"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center size-10 rounded-lg bg-[#14161a] border border-[#2a2d33]"
            >
              <Heart class="size-5 text-gray-400" />
            </div>
            <div>
              <p class="text-white text-sm font-medium">
                {{ $t("add.favoritesLabel") }}
              </p>
              <p class="text-xs text-gray-400">
                {{ $t("add.favoritesDescription") }}
              </p>
            </div>
          </div>
          <div
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1 overflow-y-auto max-h-[15vh] md:max-h-[20vh] pr-1 py-1 overflow-x-hidden"
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
        </section>
      </div>

      <DialogFooter class="pt-5 border-t border-[#2a2d33]/50">
        <DialogClose as-child>
          <Button
            variant="outline"
            class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200"
          >
            {{ $t("common.close") }}
          </Button>
        </DialogClose>
        <Button
          :disabled="!canSubmit"
          data-testid="add-submit-btn"
          class="bg-white text-[#14161a] font-medium border-transparent hover:bg-gray-200 active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          @click="handleAddStream"
        >
          {{ $t("add.addButton") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

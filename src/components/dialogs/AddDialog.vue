<script setup lang="ts">
import { ref, computed, watch } from "vue";
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
import { useStreams, type Platform } from "@/composables/useStreams";
import { useRecents } from "@/composables/useRecents";
import { useLiveStatus } from "@/composables/useLiveStatus";
import { useFavorites } from "@/composables/useFavorites";
import { PLATFORMS } from "@/config/platforms";
import { X, History, Heart } from "lucide-vue-next";

// props
const props = defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { addStream } = useStreams();
const { recents, removeRecent } = useRecents();
const { getStatus, startPolling, stopPolling } = useLiveStatus();
const { removeFavorite, liveFavorites } = useFavorites();

// Start/stop polling based on dialog visibility
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      startPolling();
    } else {
      stopPolling();
    }
  },
);

const formatViewers = (count?: number) => {
  if (!count) return "";
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
};

const handleQuickAdd = (
  channel: string,
  platform: Platform,
  iframeUrl?: string,
) => {
  addStream(channel, platform, iframeUrl);
  emit("update:open", false);
};

// local state
const channelName = ref("");
const iframeUrl = ref("");
const selectedPlatform = ref<Platform>(PLATFORMS.kick!.id as Platform);

const isCustom = computed(() => selectedPlatform.value === "custom");

const handleAddStream = () => {
  if (isCustom.value) {
    const url = iframeUrl.value.trim();
    const name = channelName.value.trim() || "Custom Stream";

    if (!url) {
      return;
    }

    addStream(name, "custom", url);
    channelName.value = "";
    iframeUrl.value = "";
    selectedPlatform.value = PLATFORMS.kick!.id as Platform;
    emit("update:open", false);
    return;
  }

  let channel = channelName.value.trim();

  // if it's a url
  if (channel.includes(".com") || channel.includes(".tv")) {
    try {
      const url = new URL(channel);

      // detect platform from URL
      for (const platform of Object.values(PLATFORMS)) {
        if (platform.domains.some((domain) => url.hostname.includes(domain))) {
          selectedPlatform.value = platform.id as Platform;
          break;
        }
      }

      // extract channel/video based on platform
      if (selectedPlatform.value === PLATFORMS.youtube!.id) {
        const videoId = url.searchParams.get("v");
        if (videoId) {
          // youtube.com/watch?v=VIDEO_ID
          channel = videoId;
        } else {
          // youtube.com/live/VIDEO_ID or youtube.com/@channel/live
          const pathParts = url.pathname.split("/").filter(Boolean);
          channel = pathParts.pop() || channel;
        }
      } else {
        // kick.com/channel or twitch.tv/channel
        const pathParts = url.pathname.split("/").filter(Boolean);
        channel = pathParts.pop() || channel;
      }
    } catch {
      // if not a valid URL, try to extract manually
      const parts = channel.split("/").filter(Boolean);
      channel = parts.pop() || channel;
      channel = channel.split("?")[0] || channel;
    }
  }

  if (!channel) {
    return;
  }

  addStream(channel, selectedPlatform.value);

  channelName.value = "";
  selectedPlatform.value = PLATFORMS.kick!.id as Platform;
  emit("update:open", false);
};

const canSubmit = computed(() => {
  if (isCustom.value) {
    return iframeUrl.value.trim().length > 0;
  }
  return channelName.value.trim().length > 0;
});
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="bg-[#191b1f] border-[#2a2d33]">
      <DialogHeader>
        <DialogTitle class="text-white">{{ $t("add.title") }}</DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ $t("add.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- recent channels -->
        <section
          v-if="recents.length"
          class="flex flex-col gap-4 border border-[#2a2d33] bg-[#14161a] p-4 rounded-xl"
        >
          <!-- recent title -->
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center size-10 rounded-lg bg-[#1a1d21] border border-[#2a2d33]"
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
          <div class="flex flex-wrap gap-2">
            <button
              v-for="recent in recents"
              :key="`${recent.platform}:${recent.channel}`"
              type="button"
              class="group relative flex items-center gap-1.5 px-3 py-0.5 rounded-full border text-sm text-white transition-all duration-200 hover:scale-105 cursor-pointer"
              :class="[
                getStatus(recent.channel, recent.platform)?.isLive
                  ? 'border-green-500/40 bg-green-500/10 hover:bg-green-500/15 hover:border-green-500/60'
                  : 'border-[#2a2d33] bg-[#0f1115] hover:bg-[#1a1d21] hover:border-[#3a3f4b]',
              ]"
              :title="
                getStatus(recent.channel, recent.platform)?.isLive
                  ? `🔴 LIVE — ${getStatus(recent.channel, recent.platform)?.viewerCount?.toLocaleString() ?? '?'} viewers${getStatus(recent.channel, recent.platform)?.category ? ` • ${getStatus(recent.channel, recent.platform)?.category}` : ''}`
                  : undefined
              "
              @click="
                handleQuickAdd(
                  recent.channel,
                  recent.platform,
                  recent.iframeUrl,
                )
              "
            >
              <!-- live indicator dot -->
              <span
                v-if="getStatus(recent.channel, recent.platform)?.isLive"
                class="relative flex h-2 w-2 shrink-0"
              >
                <span
                  class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"
                />
                <span
                  class="relative inline-flex rounded-full h-2 w-2 bg-red-500"
                />
              </span>
              <span
                v-else-if="
                  recent.platform === 'twitch' || recent.platform === 'kick'
                "
                class="h-2 w-2 shrink-0 rounded-full bg-gray-600"
              />

              <component
                :is="PLATFORMS[recent.platform]?.icon"
                :size="14"
                :style="{ color: PLATFORMS[recent.platform]?.color }"
              />
              <span class="truncate max-w-30">{{ recent.channel }}</span>

              <!-- viewer count badge -->
              <span
                v-if="getStatus(recent.channel, recent.platform)?.isLive"
                class="text-[10px] text-red-400 font-medium tabular-nums"
              >
                {{
                  formatViewers(
                    getStatus(recent.channel, recent.platform)?.viewerCount,
                  )
                }}
              </span>

              <span
                class="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-[#2a2d33] border border-[#3a3f4b] transition-colors hover:bg-red-500/80 hover:border-red-400"
                @click.stop="removeRecent(recent.channel, recent.platform)"
              >
                <X :size="8" class="text-white" />
              </span>
            </button>
          </div>
        </section>

        <!-- favorites -->
        <section
          v-if="liveFavorites.length"
          class="flex flex-col gap-4 border border-[#2a2d33] bg-[#14161a] p-4 rounded-xl"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center size-10 rounded-lg bg-[#1a1d21] border border-[#2a2d33]"
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
          <div class="flex flex-wrap gap-2">
            <button
              v-for="favorite in liveFavorites"
              :key="`${favorite.platform}:${favorite.channel}`"
              type="button"
              class="group relative flex items-center gap-1.5 px-3 py-0.5 rounded-full border text-sm text-white transition-all duration-200 hover:scale-105 cursor-pointer"
              :class="[
                getStatus(favorite.channel, favorite.platform)?.isLive
                  ? 'border-green-500/40 bg-green-500/10 hover:bg-green-500/15 hover:border-green-500/60'
                  : 'border-[#2a2d33] bg-[#0f1115] hover:bg-[#1a1d21] hover:border-[#3a3f4b]',
              ]"
              :title="
                getStatus(favorite.channel, favorite.platform)?.isLive
                  ? `🔴 LIVE — ${getStatus(favorite.channel, favorite.platform)?.viewerCount?.toLocaleString() ?? '?'} viewers${getStatus(favorite.channel, favorite.platform)?.category ? ` • ${getStatus(favorite.channel, favorite.platform)?.category}` : ''}`
                  : undefined
              "
              @click="handleQuickAdd(favorite.channel, favorite.platform)"
            >
              <component
                :is="PLATFORMS[favorite.platform]?.icon"
                :size="14"
                :style="{
                  color: PLATFORMS[favorite.platform]?.color,
                }"
              />
              <span class="truncate max-w-30">{{ favorite.channel }}</span>

              <!-- viewer count badge -->
              <span
                v-if="getStatus(favorite.channel, favorite.platform)?.isLive"
                class="text-[10px] text-red-400 font-medium tabular-nums"
              >
                {{
                  formatViewers(
                    getStatus(favorite.channel, favorite.platform)?.viewerCount,
                  )
                }}
              </span>

              <span
                class="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-[#2a2d33] border border-[#3a3f4b] transition-colors hover:bg-red-500/80 hover:border-red-400"
                @click.stop="
                  removeFavorite(favorite.channel, favorite.platform)
                "
              >
                <X :size="8" class="text-white" />
              </span>
            </button>
          </div>
        </section>

        <!-- add stream manually -->
        <div
          class="flex flex-col gap-4 border border-[#2a2d33] bg-[#14161a] p-4 rounded-xl"
        >
          <!-- platform selector with icons -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-300">{{
              $t("add.platform")
            }}</label>
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="platform in PLATFORMS"
                :key="platform.id"
                type="button"
                @click="selectedPlatform = platform.id as Platform"
                class="flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors cursor-pointer"
                :class="[
                  selectedPlatform === platform.id
                    ? 'bg-[#2a2d33] border-primary'
                    : 'bg-[#0f1115] border-[#2a2d33] hover:bg-[#1a1d21] hover:border-[#3a3f4b]',
                ]"
              >
                <component
                  :is="platform.icon"
                  :size="24"
                  :style="{ color: platform.color }"
                />
                <span class="text-xs text-white capitalize">{{
                  platform.name
                }}</span>
              </button>
            </div>
          </div>

          <!-- custom iframe URL input -->
          <div v-if="isCustom" class="space-y-4">
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-300">{{
                $t("add.iframeUrlLabel")
              }}</label>
              <input
                v-model="iframeUrl"
                type="text"
                :placeholder="$t('add.iframeUrlPlaceholder')"
                class="w-full px-3 py-2.5 rounded-lg bg-[#0f1115] text-white border border-[#2a2d33] text-sm transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 hover:border-[#3a3f4b] placeholder:text-gray-500"
                @keyup.enter="handleAddStream"
              />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-300">{{
                $t("add.customNameLabel")
              }}</label>
              <input
                v-model="channelName"
                type="text"
                :placeholder="$t('add.customNamePlaceholder')"
                class="w-full px-3 py-2.5 rounded-lg bg-[#0f1115] text-white border border-[#2a2d33] text-sm transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 hover:border-[#3a3f4b] placeholder:text-gray-500"
              />
            </div>
          </div>

          <!-- channel name (for non-custom platforms) -->
          <div v-else class="space-y-2">
            <label
              v-if="
                selectedPlatform === 'kick' || selectedPlatform === 'twitch'
              "
              class="text-sm font-medium text-gray-300"
              >{{ $t("add.channelLabel") }}</label
            >
            <label v-else class="text-sm font-medium text-gray-300">{{
              $t("add.videoIdLabel")
            }}</label>
            <input
              v-model="channelName"
              type="text"
              :placeholder="$t('add.placeholder')"
              class="w-full px-3 py-2.5 rounded-lg bg-[#0f1115] text-white border border-[#2a2d33] text-sm transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 hover:border-[#3a3f4b] placeholder:text-gray-500"
              @keyup.enter="handleAddStream"
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <DialogClose as-child>
          <Button
            variant="outline"
            class="border-[#2a2d33] bg-[#14161a] text-white hover:text-gray-300 hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
          >
            {{ $t("common.close") }}
          </Button>
        </DialogClose>
        <Button
          variant="outline"
          class="border-[#2a2d33] bg-[#14161a] text-white hover:text-gray-300 hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
          @click="handleAddStream"
          :disabled="!canSubmit"
        >
          {{ $t("add.addButton") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

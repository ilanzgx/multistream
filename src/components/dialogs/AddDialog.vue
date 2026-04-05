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
import StreamChip from "./_components/StreamChip.vue";
import { useStreams, type Platform } from "@/composables/useStreams";
import { useRecents } from "@/composables/useRecents";
import { useLiveStatus } from "@/composables/useLiveStatus";
import { useFavorites } from "@/composables/useFavorites";
import { PLATFORMS } from "@/config/platforms";
import { History, Heart } from "lucide-vue-next";

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
  return [...favorites.value].sort((a, b) => {
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
  },
);

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
  if (!canSubmit.value) return;

  if (isCustom.value) {
    let url = iframeUrl.value.trim();
    const name = channelName.value.trim() || "Custom Stream";

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
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
        if (
          platform.domains.some(
            (domain) =>
              url.hostname === domain || url.hostname.endsWith("." + domain),
          )
        ) {
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

const isValidCustomUrl = computed(() => {
  const url = iframeUrl.value.trim();
  if (!url) return false;

  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.includes(".")
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
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="bg-[#191b1f] border-[#2a2d33] max-w-xl md:max-w-2xl lg:max-w-3xl"
    >
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
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            <StreamChip
              v-for="recent in recents"
              :key="`${recent.platform}:${recent.channel}`"
              :channel="recent.channel"
              :platform="recent.platform"
              class="w-full"
              @click="
                handleQuickAdd(
                  recent.channel,
                  recent.platform,
                  recent.iframeUrl,
                )
              "
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
          <div
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 overflow-y-auto max-h-[20vh] md:max-h-[25vh] pr-1 py-1 overflow-x-hidden"
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

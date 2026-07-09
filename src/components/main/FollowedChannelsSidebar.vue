<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { load, type Store } from "@tauri-apps/plugin-store";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { Skeleton } from "../../components/ui/skeleton";
import { Users, ChevronLeft, ChevronRight, RefreshCw } from "@lucide/vue";
import TwitchIcon from "../../components/icons/TwitchIcon.vue";
import KickIcon from "../../components/icons/KickIcon.vue";
import LoginPrompt from "../../components/chat/LoginPrompt.vue";
import { useI18n } from "vue-i18n";
import { useFollowedChannels, type FollowedChannel } from "../../composables/useFollowedChannels";
import { useTwitchAuth } from "../../composables/useTwitchAuth";
import { useStreams } from "../../composables/useStreams";
import { isTauri } from "../../composables/useUpdater";
const { channels, isLoading, platformFilter, refresh } = useFollowedChannels();
const { addStream } = useStreams();
const { t, locale } = useI18n();
const { authenticated: isTwitchAuth } = useTwitchAuth();

const liveChannels = computed(() => channels.value.filter((c) => c.isLive));

const openTwitchAuthDialog = () => {
  window.dispatchEvent(new CustomEvent("multistream-show-dialog", { detail: "twitch-auth" }));
};

const isOpen = ref<boolean | undefined>(false);
const isStoreLoaded = ref(false);
let store: Store | null = null;

const initStore = async () => {
  if (!isTauri()) {
    isStoreLoaded.value = true;
    return;
  }
  try {
    store = await load("sidebar.json", { autoSave: true } as any);
    const stored = await store.get<boolean>("left-sidebar-open");
    if (stored !== null) {
      isOpen.value = stored;
    }
  } catch (e) {
    console.error("Failed to load store", e);
  } finally {
    isStoreLoaded.value = true;
  }
};

const toggleSidebar = async () => {
  isOpen.value = !isOpen.value;
  if (store) {
    await store.set("left-sidebar-open", isOpen.value);
  }
  if (isOpen.value) {
    refresh();
  }
};

onMounted(() => {
  initStore();
});

const onAddClick = (channel: FollowedChannel) => {
  addStream(channel.id, channel.platform);
};

const formatViewers = (count: number) => {
  return new Intl.NumberFormat(locale.value, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
};
</script>

<template>
  <div
    class="flex-shrink-0 ease-in-out border-r border-[#2a2d33] bg-[#14161a] h-full flex flex-col z-20 relative"
    :class="[isOpen ? 'w-56' : 'w-14', isStoreLoaded ? 'transition-all duration-300' : '']"
  >
    <div
      class="h-12 flex items-center px-2 border-b border-[#1f2227] shrink-0"
      :class="isOpen ? 'justify-between' : 'justify-center'"
    >
      <div v-if="isOpen" class="flex items-center gap-2">
        <Users class="w-4 h-4 text-gray-400" />
        <span class="text-[10px] font-semibold tracking-widest uppercase text-gray-400">{{
          t("sidebar.followedChannels")
        }}</span>
      </div>

      <button
        class="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-[#1f2227] transition-colors"
        @click="toggleSidebar"
      >
        <ChevronLeft v-if="isOpen" class="w-4 h-4" />
        <ChevronRight v-else class="w-4 h-4" />
      </button>
    </div>

    <div
      v-if="isOpen"
      class="px-2 py-1.5 border-b border-[#1f2227] flex items-center justify-between"
    >
      <div class="flex items-center gap-1">
        <button
          class="px-1.5 py-1 rounded text-[10px] font-bold tracking-wider uppercase transition-colors"
          :class="
            platformFilter === 'all'
              ? 'text-white bg-[#1f2227]'
              : 'text-gray-500 hover:text-gray-300'
          "
          :title="t('sidebar.all')"
          @click="platformFilter = 'all'"
        >
          {{ t("sidebar.all") }}
        </button>
        <button
          class="p-1 rounded transition-colors"
          :class="
            platformFilter === 'twitch'
              ? 'text-[#9146FF] bg-[#9146ff]/10'
              : 'text-gray-500 hover:text-gray-300'
          "
          title="Twitch"
          @click="platformFilter = 'twitch'"
        >
          <TwitchIcon class="w-3.5 h-3.5" />
        </button>
        <button
          class="p-1 rounded transition-colors"
          :class="
            platformFilter === 'kick'
              ? 'text-[#53FC18] bg-[#53fc18]/10'
              : 'text-gray-500 hover:text-gray-300'
          "
          title="Kick"
          @click="platformFilter = 'kick'"
        >
          <KickIcon class="w-3.5 h-3.5" />
        </button>
      </div>
      <button
        class="text-gray-500 hover:text-gray-300 transition-colors p-1 -mr-1 rounded-md"
        :class="{ 'pointer-events-none': isLoading }"
        @click="refresh"
      >
        <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin text-gray-400': isLoading }" />
      </button>
    </div>

    <TooltipProvider :delay-duration="0" :disable-hoverable-content="true">
      <div class="flex-1 overflow-y-auto py-1 flex flex-col gap-0.5 px-1.5 custom-scrollbar">
        <template v-if="isLoading && liveChannels.length === 0">
          <div v-for="i in 20" :key="i" class="flex items-center gap-2 p-1 rounded-md">
            <div class="relative shrink-0">
              <Skeleton class="w-7 h-7 rounded-full border border-[#2a2d33] bg-[#1f2227]" />
              <div
                class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border border-[#14161a] flex items-center justify-center bg-[#0f1115]"
              >
                <Skeleton class="w-2.5 h-2.5 rounded-full bg-[#2a2d33]" />
              </div>
            </div>

            <div v-if="isOpen" class="flex-1 min-w-0 flex flex-col justify-center">
              <div class="flex items-center justify-between gap-2">
                <Skeleton class="h-3.5 w-20 bg-[#1f2227]" />
                <div class="flex items-center gap-1 shrink-0">
                  <Skeleton class="w-1.5 h-1.5 rounded-full bg-[#1f2227]" />
                  <Skeleton class="h-3 w-5 bg-[#1f2227]" />
                </div>
              </div>
              <Skeleton class="h-3 w-28 bg-[#1f2227] mt-1" />
            </div>
          </div>
        </template>

        <template v-for="channel in liveChannels" v-else :key="channel.platform + '-' + channel.id">
          <Tooltip>
            <TooltipTrigger as-child>
              <div
                class="flex items-center gap-2 p-1 rounded-md hover:bg-[#1f2227] cursor-pointer group transition-colors"
                @click.stop="onAddClick(channel)"
              >
                <div class="relative shrink-0">
                  <div class="avatar-border rounded-full" :class="{ followed: channel.isFollowed }">
                    <img
                      loading="lazy"
                      :src="
                        channel.avatarUrl ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(channel.displayName)}&background=random`
                      "
                      class="w-7 h-7 rounded-full block object-cover"
                    />
                  </div>
                  <div
                    class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border border-[#14161a] flex items-center justify-center bg-[#0f1115]"
                  >
                    <TwitchIcon
                      v-if="channel.platform === 'twitch'"
                      class="w-2.5 h-2.5 text-[#9146FF]"
                    />
                    <KickIcon
                      v-if="channel.platform === 'kick'"
                      class="w-2.5 h-2.5 text-[#53FC18]"
                    />
                  </div>
                </div>

                <div v-if="isOpen" class="flex-1 min-w-0 flex flex-col justify-center">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-medium text-gray-200 truncate">{{
                      channel.displayName
                    }}</span>
                    <div class="flex items-center gap-1 text-rose-400 shrink-0">
                      <div class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></div>
                      <span class="text-xs font-semibold">{{
                        formatViewers(channel.viewerCount || 0)
                      }}</span>
                    </div>
                  </div>
                  <span
                    v-if="channel.game || channel.title"
                    class="text-xs text-gray-400 truncate"
                    >{{ channel.game || channel.title }}</span
                  >
                </div>
              </div>
            </TooltipTrigger>

            <TooltipContent
              side="right"
              :side-offset="10"
              class="w-64 p-0 bg-[#0f1115] border-[#2a2d33] rounded-lg shadow-xl shadow-black/50 overflow-hidden"
              hide-arrow
            >
              <img
                v-if="channel.thumbnailUrl"
                loading="lazy"
                :src="channel.thumbnailUrl"
                referrerpolicy="no-referrer"
                class="w-full aspect-video object-cover"
              />
              <div v-else class="w-full aspect-video bg-[#14161a] border-b border-[#2a2d33]"></div>
              <div class="p-2">
                <h4 class="text-sm font-medium text-white line-clamp-1">{{ channel.title }}</h4>
                <p class="text-xs text-gray-400 mt-0.5 truncate">{{ channel.game }}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </template>
      </div>
    </TooltipProvider>

    <LoginPrompt
      v-if="isOpen && !isTwitchAuth"
      platform="twitch"
      position="top"
      title-key="sidebar.loginTitle"
      subtitle-key="sidebar.loginSubtitle"
      compact
      @connect="openTwitchAuthDialog"
    />
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #2a2d33;
  border-radius: 4px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background: #3a3f4b;
}

.avatar-border {
  padding: 1.5px;
  background: #2a2d33;
}

.avatar-border.followed {
  background: #9146ff;
}
</style>

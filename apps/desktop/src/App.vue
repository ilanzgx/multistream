<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import { Menu, X } from "@lucide/vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useStreams, type Platform } from "./composables/useStreams";
import { usePreferences } from "./composables/usePreferences";
import { useUpdater, isTauri } from "./composables/useUpdater";
import { useLiveStatus } from "./composables/useLiveStatus";
import { useMediaCodecs } from "./composables/useMediaCodecs";
import { useRecording } from "./composables/useRecording";
import { UNIFIED_CHAT_ID } from "./composables/useUnifiedChat";
import { useDeepLink } from "./composables/useDeepLink";
import ToastProvider from "./components/ui/toast/ToastProvider.vue";
import FollowedChannelsSidebar from "./components/main/FollowedChannelsSidebar.vue";
import SidebarPanel from "./components/main/SidebarPanel.vue";
import StreamGrid from "./components/main/StreamGrid.vue";
import EmptyState from "./components/main/EmptyState.vue";
import OnboardingTour from "./components/dialogs/OnboardingTour.vue";
import TwitchAuthDialog from "./components/dialogs/TwitchAuthDialog.vue";
import KickAuthDialog from "./components/dialogs/KickAuthDialog.vue";

import { toast } from "@/composables/useToast";
import { useI18n } from "vue-i18n";
import { parseUrlOptions } from "./lib/parseUrlOptions";
import { APP_LINKS } from "./config/links";

const sidebarRef = ref<InstanceType<typeof SidebarPanel> | null>(null);
const showOnboarding = ref(false);
const dismissedWebBanner = ref(false);
const showTwitchAuth = ref(false);
const showKickAuth = ref(false);

const hasOpenedOnboarding = ref(false);
const hasOpenedTwitchAuth = ref(false);
const hasOpenedKickAuth = ref(false);

watch(
  showOnboarding,
  (val) => {
    if (val) hasOpenedOnboarding.value = true;
  },
  { immediate: true }
);
watch(
  showTwitchAuth,
  (val) => {
    if (val) hasOpenedTwitchAuth.value = true;
  },
  { immediate: true }
);
watch(
  showKickAuth,
  (val) => {
    if (val) hasOpenedKickAuth.value = true;
  },
  { immediate: true }
);

const { streams, addStream, clearStreams } = useStreams();
const { selectedChat, sidebarOpen, setSelectedChat, onboardingCompleted, setOnboardingCompleted } =
  usePreferences();
const { checkForUpdates } = useUpdater();
const { refreshSuggestions, startPolling } = useLiveStatus();
const { checkVideoCodecs } = useMediaCodecs();
const { checkDependencies } = useRecording();
const { locale, t } = useI18n();

useDeepLink();

function handleGlobalKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
    return;
  }

  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 9) {
    const stream = streams.value[num - 1];
    if (stream) {
      setSelectedChat(`${stream.platform}:${stream.channel}`);
    }
    return;
  }

  // S: screenshot focused stream
  if (e.key.toLowerCase() === "s") {
    window.dispatchEvent(new CustomEvent("multistream-screenshot"));
    return;
  }

  // D: open add stream dialog
  if (e.key.toLowerCase() === "d") {
    window.dispatchEvent(
      new CustomEvent("multistream-show-dialog", {
        detail: "add-stream",
      })
    );
  }
}

function handleFrameShortcuts(e: MessageEvent) {
  if (e.data?.type !== "SHORTCUT") return;

  // 1-9: quick select chat
  const num = parseInt(e.data.key, 10);
  if (num >= 1 && num <= 9) {
    const stream = streams.value[num - 1];
    if (stream) {
      setSelectedChat(`${stream.platform}:${stream.channel}`);
    }
    return;
  }

  // S: screenshot focused stream
  if (e.data?.key?.toLowerCase() === "s") {
    window.dispatchEvent(new CustomEvent("multistream-screenshot"));
    return;
  }

  // D: open add stream dialog
  if (e.data?.key?.toLowerCase() === "d") {
    window.dispatchEvent(
      new CustomEvent("multistream-show-dialog", {
        detail: "add-stream",
      })
    );
  }
}

watch(streams, (newStreams, oldStreams) => {
  if (
    selectedChat.value &&
    selectedChat.value !== UNIFIED_CHAT_ID &&
    !newStreams.some((s) => `${s.platform}:${s.channel}` === selectedChat.value)
  ) {
    setSelectedChat("");
  }

  // when none streams are selected, auto load the chat of the first stream
  // if have more than 1 stream and remove one, auto load the chat of the first stream
  // if something wrong happens, falls on fallback
  const prevLen = oldStreams?.length ?? 0;
  if (
    selectedChat.value !== UNIFIED_CHAT_ID &&
    ((prevLen === 0 && newStreams.length === 1) || (prevLen > 1 && newStreams.length === 1))
  ) {
    const first = newStreams.find((s) => s.platform !== "custom");
    if (first) {
      setSelectedChat(`${first.platform}:${first.channel}`);
    } else {
      setSelectedChat("");
    }
  }

  if (newStreams.length === 0) {
    refreshSuggestions();
  }
});

watch(locale, () => {
  if (streams.value.length === 0) {
    refreshSuggestions();
  }
});

function handleDialogShowEvent(e: Event) {
  const evt = e as CustomEvent;
  if (evt.detail === "onboarding-tour") {
    showOnboarding.value = true;
  } else if (evt.detail === "twitch-auth") {
    showTwitchAuth.value = true;
  } else if (evt.detail === "kick-auth") {
    showKickAuth.value = true;
  }
}

let unlistenWatch: UnlistenFn | null = null;

onMounted(async () => {
  window.addEventListener("keydown", handleGlobalKeyDown);
  window.addEventListener("message", handleFrameShortcuts);
  window.addEventListener("multistream-show-dialog", handleDialogShowEvent);

  if (isTauri()) {
    try {
      unlistenWatch = await listen<{ channel: string; platform: Platform }>(
        "notification-watch",
        (event) => {
          const { channel, platform } = event.payload;
          addStream(channel, platform);
        }
      );
    } catch (e) {
      console.warn("Failed to register notification listener:", e);
    }
  }

  if (!onboardingCompleted.value) {
    showOnboarding.value = true;
  }

  // check for updates on startup
  checkForUpdates();
  checkVideoCodecs();
  checkDependencies();

  // start polling favorites live status (every 30s)
  startPolling();

  // check for streams on startup
  try {
    const parsedStreams = parseUrlOptions(window.location.search);

    if (parsedStreams === null) {
      if (streams.value.length === 0) {
        refreshSuggestions();
      }
    } else {
      clearStreams();
      parsedStreams.forEach((s) => addStream(s.channel, s.platform, s.iframeUrl));
      window.history.replaceState({}, "", window.location.pathname);
    }
  } catch {
    toast.error(t("import.invalidCustom"));
    window.history.replaceState({}, "", window.location.pathname);
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalKeyDown);
  window.removeEventListener("message", handleFrameShortcuts);
  window.removeEventListener("multistream-show-dialog", handleDialogShowEvent);

  if (unlistenWatch) {
    unlistenWatch();
  }
});
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-[#191b1f]">
    <!-- left sidebar -->
    <FollowedChannelsSidebar />

    <div class="flex flex-col flex-1 overflow-hidden relative">
      <div
        v-if="!isTauri() && !dismissedWebBanner"
        class="w-full flex items-center justify-center gap-4 px-4 py-2 bg-[#14161a] border-b border-[#2a2d33] shrink-0 animate-in fade-in slide-in-from-top-2 duration-300"
      >
        <span class="text-[13px] text-[#e0e0e0] whitespace-nowrap">{{
          $t("webBanner.title")
        }}</span>
        <div class="flex items-center gap-3 border-l border-[#2a2d33] pl-3">
          <a
            :href="APP_LINKS.github.releases"
            target="_blank"
            class="text-[13px] font-medium text-white hover:text-gray-300 transition-colors"
            >{{ $t("webBanner.button") }}</a
          >
          <button
            :aria-label="$t('common.close')"
            class="text-[#787774] hover:text-white transition-colors flex items-center justify-center cursor-pointer"
            @click="dismissedWebBanner = true"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- main -->
      <main class="flex-1 overflow-y-auto bg-[#1f2227]">
        <!-- stream grid -->
        <StreamGrid v-if="streams.length > 0" />

        <EmptyState v-else @add="sidebarRef?.openAddDialog()" @tour="showOnboarding = true" />
      </main>
    </div>

    <!-- sidebar -->
    <SidebarPanel ref="sidebarRef" />

    <!-- toggle button -->
    <button
      v-if="!sidebarOpen"
      :aria-label="$t('sidebar.openSidebar')"
      class="fixed right-0 top-5/12 -translate-y-1/2 flex items-center justify-center w-8 py-6 bg-[#14161a] border border-r-0 border-[#2a2d33] rounded-l-lg shadow-xl shadow-black/30 cursor-pointer transition-all duration-300 hover:w-8 hover:bg-[#1c1f24] hover:border-[#3a3f4b] hover:shadow-black/50 group animate-in fade-in slide-in-from-right-2"
      @click="sidebarOpen = true"
    >
      <Menu class="size-4 text-gray-400 group-hover:text-white transition-colors duration-200" />
    </button>

    <ToastProvider />

    <!-- onboarding tour -->
    <OnboardingTour
      v-if="hasOpenedOnboarding"
      v-model:open="showOnboarding"
      :allow-outside-close="onboardingCompleted"
      @complete="setOnboardingCompleted(true)"
    />

    <TwitchAuthDialog v-if="hasOpenedTwitchAuth" v-model:open="showTwitchAuth" />
    <KickAuthDialog v-if="hasOpenedKickAuth" v-model:open="showKickAuth" />
  </div>
</template>

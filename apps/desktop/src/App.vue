<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import { Menu, X, WifiOff } from "@lucide/vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useStreams, type Platform } from "./composables/useStreams";
import { usePreferences } from "./composables/usePreferences";
import { useUpdater, isTauri } from "./composables/useUpdater";
import { useLiveStatus } from "./composables/useLiveStatus";
import { useMediaCodecs } from "./composables/useMediaCodecs";
import { useRecording } from "./composables/useRecording";
import { useDeepLink } from "./composables/useDeepLink";
import { useNetworkStatus } from "./composables/useNetworkStatus";
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
import { resolveStream } from "./lib/streamResolver";
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
const { sidebarOpen, setSelectedChat, onboardingCompleted, setOnboardingCompleted } =
  usePreferences();
const { checkForUpdates } = useUpdater();
const { refreshSuggestions, startPolling } = useLiveStatus();
const { checkVideoCodecs } = useMediaCodecs();
const { checkDependencies } = useRecording();
const { locale, t } = useI18n();
const { isOnline, onReconnect } = useNetworkStatus();

onReconnect(() => {
  toast.success(t("network.reconnected"), { id: "network-reconnected", duration: 3000 });
});

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

watch(streams, (newStreams) => {
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
    invoke("stop_all_recordings_on_reload").catch(() => {});
    try {
      unlistenWatch = await listen<{ channel: string; platform: Platform }>(
        "notification-watch",
        async (event) => {
          const { channel, platform } = event.payload;
          if (platform === "youtube") {
            const resolved = await resolveStream({ channel, platform });
            if (resolved) {
              addStream(
                resolved.channel,
                resolved.platform,
                resolved.iframeUrl,
                resolved.displayName,
                resolved.handle
              );
              return;
            }
          }
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
      for (const s of parsedStreams) {
        const resolved = await resolveStream(s);
        if (resolved) {
          addStream(
            resolved.channel,
            resolved.platform,
            resolved.iframeUrl,
            resolved.displayName,
            resolved.handle
          );
        } else if (s.platform === "youtube") {
          toast.error(t("toasts.youtube.offline"));
        }
      }
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
    <!-- offline banner -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-2 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 -translate-y-2 scale-95"
    >
      <div
        v-if="!isOnline"
        data-testid="network-offline-banner"
        class="fixed top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#14161a]/95 border border-[#2a2d33] text-xs shadow-xl shadow-black/50 backdrop-blur-md select-none"
      >
        <WifiOff class="size-3.5 text-zinc-400 shrink-0" />
        <span class="text-zinc-200 font-medium">{{ $t("network.offline") }}</span>
        <span class="text-zinc-500 font-normal">({{ $t("network.reconnecting") }})</span>
      </div>
    </Transition>

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

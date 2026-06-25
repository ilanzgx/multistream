<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, defineAsyncComponent } from "vue";
import { Menu } from "lucide-vue-next";
import { useStreams } from "./composables/useStreams";
import { usePreferences } from "./composables/usePreferences";
import { useUpdater } from "./composables/useUpdater";
import { useLiveStatus } from "./composables/useLiveStatus";
import { UNIFIED_CHAT_ID } from "./composables/useUnifiedChat";
import "vue-sonner/style.css";
import { Toaster } from "./components/ui/sonner";
import SidebarPanel from "./components/main/SidebarPanel.vue";
const StreamGrid = defineAsyncComponent(() => import("./components/main/StreamGrid.vue"));
const EmptyState = defineAsyncComponent(() => import("./components/main/EmptyState.vue"));

const OnboardingTour = defineAsyncComponent(
  () => import("./components/dialogs/OnboardingTour.vue")
);
const TwitchAuthDialog = defineAsyncComponent(
  () => import("./components/dialogs/TwitchAuthDialog.vue")
);
const KickAuthDialog = defineAsyncComponent(
  () => import("./components/dialogs/KickAuthDialog.vue")
);

import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { parseUrlOptions } from "./lib/parseUrlOptions";

const sidebarRef = ref<InstanceType<typeof SidebarPanel> | null>(null);
const showOnboarding = ref(false);
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
const { locale } = useI18n();

function handleGlobalKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
    return;
  }

  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 9) {
    const stream = streams.value[num - 1];
    if (stream) {
      setSelectedChat(stream.channel);
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
      setSelectedChat(stream.channel);
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
  if (selectedChat.value === UNIFIED_CHAT_ID) {
    const hasTwitchStreams = newStreams.some((s) => s.platform === "twitch");
    if (!hasTwitchStreams) {
      setSelectedChat("");
    }
  } else if (selectedChat.value && !newStreams.some((s) => s.channel === selectedChat.value)) {
    setSelectedChat("");
  }

  // when none streams are selected, auto load the chat of the first stream
  // if have more than 1 stream and remove one, auto load the chat of the first stream
  // if something wrong happens, falls on fallback
  if (
    selectedChat.value !== UNIFIED_CHAT_ID &&
    ((oldStreams.length === 0 && newStreams.length === 1) ||
      (oldStreams.length > 1 && newStreams.length === 1))
  ) {
    setSelectedChat(newStreams[0]?.channel || "");
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

onMounted(() => {
  window.addEventListener("keydown", handleGlobalKeyDown);
  window.addEventListener("message", handleFrameShortcuts);
  window.addEventListener("multistream-show-dialog", handleDialogShowEvent);

  if (!onboardingCompleted.value) {
    showOnboarding.value = true;
  }
  // dismiss splash screen after a brief moment so user sees the loading state
  const splash = document.getElementById("splash");
  if (splash) {
    setTimeout(() => {
      splash.classList.add("fade-out");
      setTimeout(() => splash.remove(), 250);
    }, 300);
  }

  // check for updates on startup
  checkForUpdates();

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
    toast.error("Failed to parse custom streams");
    window.history.replaceState({}, "", window.location.pathname);
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalKeyDown);
  window.removeEventListener("message", handleFrameShortcuts);
  window.removeEventListener("multistream-show-dialog", handleDialogShowEvent);
});
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-[#191b1f]">
    <!-- main -->
    <main class="flex-1 overflow-y-auto bg-[#1f2227]">
      <!-- stream grid -->
      <StreamGrid v-if="streams.length > 0" />

      <!-- empty state (no streams) -->
      <EmptyState v-else @add="sidebarRef?.openAddDialog()" @tour="showOnboarding = true" />
    </main>

    <!-- sidebar -->
    <SidebarPanel ref="sidebarRef" />

    <!-- toggle button -->
    <button
      v-if="!sidebarOpen"
      aria-label="Abrir menu lateral"
      class="fixed right-0 top-5/12 -translate-y-1/2 flex items-center justify-center w-8 py-6 bg-[#14161a] border border-r-0 border-[#2a2d33] rounded-l-lg shadow-xl shadow-black/30 cursor-pointer transition-all duration-300 hover:w-8 hover:bg-[#1c1f24] hover:border-[#3a3f4b] hover:shadow-black/50 group animate-in fade-in slide-in-from-right-2"
      @click="sidebarOpen = true"
    >
      <Menu class="size-4 text-gray-400 group-hover:text-white transition-colors duration-200" />
    </button>

    <!-- toast notifications -->
    <Toaster
      position="bottom-left"
      theme="dark"
      :duration="2500"
      :toast-options="{
        style: {
          padding: '12px 16px',
          fontSize: '13px',
          backgroundColor: '#14161a',
          color: '#fff',
          borderColor: '#2a2d33',
        },
      }"
    />

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

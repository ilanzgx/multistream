<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { Menu } from "lucide-vue-next";
import { useStreams } from "./composables/useStreams";
import { usePreferences } from "./composables/usePreferences";
import { useUpdater } from "./composables/useUpdater";
import { useLiveStatus } from "./composables/useLiveStatus";
import "vue-sonner/style.css";
import { Toaster } from "./components/ui/sonner";
import SidebarPanel from "./components/main/SidebarPanel.vue";
import StreamGrid from "./components/main/StreamGrid.vue";
import EmptyState from "./components/main/EmptyState.vue";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { parseUrlOptions } from "./lib/parseUrlOptions";

const sidebarRef = ref<InstanceType<typeof SidebarPanel> | null>(null);

const { streams, addStream, clearStreams } = useStreams();
const { selectedChat, sidebarOpen, setSelectedChat } = usePreferences();
const { checkForUpdates } = useUpdater();
const { refreshSuggestions, startPolling } = useLiveStatus();
const { locale } = useI18n();

watch(streams, (newStreams, oldStreams) => {
  if (
    selectedChat.value &&
    !newStreams.some((s) => s.channel === selectedChat.value)
  ) {
    setSelectedChat("");
  }

  // when none streams are selected, auto load the chat of the first stream
  // if have more than 1 stream and remove one, auto load the chat of the first stream
  // if something wrong happens, falls on fallback
  if (
    (oldStreams.length === 0 && newStreams.length === 1) ||
    (oldStreams.length > 1 && newStreams.length === 1)
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

onMounted(() => {
  // dismiss splash screen after a brief moment so user sees the loading state
  const splash = document.getElementById("splash");
  if (splash) {
    setTimeout(() => {
      splash.classList.add("fade-out");
      setTimeout(() => splash.remove(), 400);
    }, 800);
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
      parsedStreams.forEach((s) =>
        addStream(s.channel, s.platform, s.iframeUrl),
      );
      window.history.replaceState({}, "", window.location.pathname);
    }
  } catch {
    toast.error("Failed to parse custom streams");
    window.history.replaceState({}, "", window.location.pathname);
  }
});
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-[#191b1f]">
    <!-- main -->
    <main class="flex-1 overflow-y-auto bg-[#1f2227]">
      <!-- stream grid -->
      <StreamGrid v-if="streams.length > 0" />

      <!-- empty state (no streams) -->
      <EmptyState v-else @add="sidebarRef?.openAddDialog()" />
    </main>

    <!-- sidebar -->
    <SidebarPanel ref="sidebarRef" />

    <!-- toggle button -->
    <button
      v-if="!sidebarOpen"
      @click="sidebarOpen = true"
      class="fixed right-0 top-5/12 -translate-y-1/2 flex items-center justify-center w-8 py-6 bg-[#14161a] border border-r-0 border-[#2a2d33] rounded-l-lg shadow-xl shadow-black/30 cursor-pointer transition-all duration-300 hover:w-8 hover:bg-[#1c1f24] hover:border-[#3a3f4b] hover:shadow-black/50 group animate-in fade-in slide-in-from-right-2"
    >
      <Menu
        class="size-4 text-gray-500 group-hover:text-white transition-colors duration-200"
      />
    </button>

    <!-- toast notifications -->
    <Toaster
      position="bottom-left"
      theme="dark"
      :duration="2500"
      :toastOptions="{
        style: {
          padding: '12px 16px',
          fontSize: '13px',
          backgroundColor: '#14161a',
          color: '#fff',
          borderColor: '#2a2d33',
        },
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { Menu } from "lucide-vue-next";
import { useStreams, type Platform } from "./composables/useStreams";
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

const sidebarRef = ref<InstanceType<typeof SidebarPanel> | null>(null);

const { streams, addStream, clearStreams } = useStreams();
const { selectedChat, sidebarOpen, setSelectedChat } = usePreferences();
const { checkForUpdates } = useUpdater();
const { refreshSuggestions } = useLiveStatus();
const { locale } = useI18n();

watch(streams, (newStreams, oldStreams) => {
  if (
    selectedChat.value &&
    !newStreams.some((s) => s.channel === selectedChat.value)
  ) {
    setSelectedChat("");
  }

  // when none streams are selected, auto load the chat of the first stream
  // if something wrong happens, falls on fallback
  if (oldStreams.length === 0 && newStreams.length === 1) {
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
  // check for updates on startup
  checkForUpdates();

  // check for streams on startup
  const urlParams = new URLSearchParams(window.location.search);
  const streamsParam = urlParams.get("streams");
  const customParam = urlParams.get("c");

  if (!streamsParam && !customParam && streams.value.length === 0) {
    refreshSuggestions();
  }

  if (streamsParam || customParam) {
    clearStreams();

    // parse regular streams (kick, twitch, youtube)
    if (streamsParam) {
      const streamList = streamsParam.split(",");
      streamList.forEach((stream) => {
        const [platform, channel] = stream.split(":");
        if (platform && channel) {
          addStream(channel, platform as Platform);
        }
      });
    }

    // parse custom streams (Base64 encoded)
    if (customParam) {
      try {
        const customStreams = JSON.parse(atob(customParam)) as {
          n: string;
          u: string;
        }[];
        customStreams.forEach((s) => {
          if (s.u) {
            addStream(s.n || "Custom Stream", "custom", s.u);
          }
        });
      } catch {
        toast.error("Failed to parse custom streams");
      }
    }

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

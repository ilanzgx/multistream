<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { Button } from "./components/ui/button";
import KickChat from "./components/chat/KickChat.vue";
import KickStream from "./components/stream/KickStream.vue";
import TwitchChat from "./components/chat/TwitchChat.vue";
import TwitchStream from "./components/stream/TwitchStream.vue";
import YoutubeStream from "./components/stream/YoutubeStream.vue";
import YoutubeChat from "./components/chat/YoutubeChat.vue";
import AddDialog from "./components/dialogs/AddDialog.vue";
import ShareDialog from "./components/dialogs/ShareDialog.vue";
import SettingsDialog from "./components/dialogs/SettingsDialog.vue";
import { UserPlus2, Settings2, Share2, PanelRightClose } from "lucide-vue-next";
import { useStreams, type Platform } from "./composables/useStreams";
import { usePreferences } from "./composables/usePreferences";
import { useUpdater } from "./composables/useUpdater";
import "vue-sonner/style.css";
import { Toaster } from "./components/ui/sonner";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "./components/ui/tooltip";

const addDialogOpen = ref(false);
const shareDialogOpen = ref(false);
const settingsDialogOpen = ref(false);
const appVersion = import.meta.env.VITE_APP_VERSION;

const { streams, addStream, clearStreams, gridClass } = useStreams();
const { selectedChat, sidebarOpen, setSelectedChat } = usePreferences();
const { checkForUpdates } = useUpdater();

const selectedChatData = computed(() =>
  streams.value.find((s) => s.channel === selectedChat.value)
);

watch(streams, (newStreams) => {
  if (
    selectedChat.value &&
    !newStreams.some((s) => s.channel === selectedChat.value)
  ) {
    setSelectedChat("");
  }
});

onMounted(() => {
  // check for updates on startup
  if ("__TAURI__" in window) {
    checkForUpdates();
  }

  // check for streams on startup
  const urlParams = new URLSearchParams(window.location.search);
  const streamsParam = urlParams.get("streams");

  if (streamsParam) {
    clearStreams();

    const streamList = streamsParam.split(",");
    streamList.forEach((stream) => {
      const [platform, channel] = stream.split(":");
      if (platform && channel) {
        addStream(channel, platform as Platform);
      }
    });

    window.history.replaceState({}, "", window.location.pathname);
  }
});
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-[#191b1f]">
    <!-- main -->
    <main class="flex-1 overflow-hidden bg-[#1f2227]">
      <div v-if="streams.length > 0" class="h-full grid" :class="gridClass">
        <template v-for="(stream, index) in streams" :key="stream.id">
          <KickStream
            v-if="stream.platform === 'kick'"
            :channel="stream.channel"
            :channelid="stream.id"
            :class="{
              'col-span-2 justify-self-center w-1/2':
                streams.length === 3 && index === 2,
            }"
          />
          <TwitchStream
            v-else-if="stream.platform === 'twitch'"
            :channel="stream.channel"
            :channelid="stream.id"
            :class="{
              'col-span-2 justify-self-center w-1/2':
                streams.length === 3 && index === 2,
            }"
          />
          <YoutubeStream
            v-else-if="stream.platform === 'youtube'"
            :channel="stream.channel"
            :channelid="stream.id"
            :class="{
              'col-span-2 justify-self-center w-1/2':
                streams.length === 3 && index === 2,
            }"
          />
        </template>
      </div>
      <div v-else class="flex items-center justify-center h-full">
        <div class="flex flex-col items-center gap-4">
          <h2 class="text-2xl text-white">No streams registered</h2>
          <Button
            class="cursor-pointer"
            variant="outline"
            @click="addDialogOpen = true"
            >Add Stream</Button
          >
        </div>
      </div>
    </main>

    <!-- sidebar -->
    <aside
      class="shadow-lg transition-all duration-200 flex flex-col overflow-hidden"
      :class="sidebarOpen ? 'w-80' : 'w-0'"
    >
      <div
        :key="sidebarOpen ? 'open' : 'closed'"
        class="flex flex-col h-full min-w-80"
        :style="{
          opacity: sidebarOpen ? 1 : 0,
          transition: sidebarOpen ? 'opacity 150ms' : 'opacity 50ms',
        }"
      >
        <!-- stream selector -->
        <div class="p-4 border-b border-[#1f2227]">
          <select
            v-model="selectedChat"
            class="w-full px-3 py-2.5 rounded-lg bg-[#14161a] text-white border border-[#2a2d33] text-sm transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 hover:border-[#3a3f4b] cursor-pointer"
          >
            <option disabled value="">Select stream chat</option>
            <option
              v-for="stream in streams"
              :key="stream.id"
              :value="stream.channel"
            >
              {{ stream.channel }}
            </option>
          </select>
        </div>

        <!-- chat area -->
        <div class="flex-1 overflow-hidden">
          <KickChat
            v-if="selectedChatData?.platform === 'kick'"
            :channel="selectedChat"
          />
          <TwitchChat
            v-else-if="selectedChatData?.platform === 'twitch'"
            :channel="selectedChat"
          />
          <YoutubeChat
            v-else-if="selectedChatData?.platform === 'youtube'"
            :channel="selectedChat"
          />
          <div
            v-else-if="!selectedChat && streams.length > 0"
            class="flex items-center justify-center h-full text-muted-foreground"
          >
            <p class="text-center px-4 text-white">
              Select a stream to view chat.
            </p>
          </div>
          <div
            v-else-if="streams.length === 0"
            class="flex items-center justify-center h-full text-muted-foreground"
          >
            <p class="text-center px-4 text-white">
              No streams available.<br />Add a stream to view chat.
            </p>
          </div>
        </div>

        <!-- action buttons -->
        <div class="p-4 border-t border-t-[#1f2227]">
          <TooltipProvider>
            <div class="flex justify-center items-center gap-4">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    class="h-9 w-9 rounded-lg border-[#2a2d33] bg-[#14161a] hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
                    variant="outline"
                    @click="addDialogOpen = true"
                  >
                    <UserPlus2 class="size-4 text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add Stream</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    class="h-9 w-9 rounded-lg border-[#2a2d33] bg-[#14161a] hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
                    variant="outline"
                    @click="settingsDialogOpen = true"
                  >
                    <Settings2 class="size-4 text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Settings</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    class="h-9 w-9 rounded-lg border-[#2a2d33] bg-[#14161a] hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
                    variant="outline"
                    @click="shareDialogOpen = true"
                  >
                    <Share2 class="size-4 text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Share</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    class="h-9 w-9 rounded-lg border-[#2a2d33] bg-[#14161a] hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
                    variant="outline"
                    @click="sidebarOpen = !sidebarOpen"
                  >
                    <PanelRightClose class="size-4 text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Hide</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          <!-- version -->
          <p
            v-if="appVersion"
            class="mt-2 text-center text-xs text-gray-400 select-none"
          >
            v{{ appVersion }}
          </p>
        </div>
      </div>
    </aside>

    <!-- toggle button -->
    <Button
      v-if="!sidebarOpen"
      @click="sidebarOpen = true"
      class="fixed text-black right-0 top-1/2 -translate-y-1/2 bg-card border border-r-0 rounded-l-lg px-2 py-8 shadow-lg hover:bg-accent transition-colors cursor-pointer"
    >
      ☰
    </Button>

    <!-- dialogs -->
    <AddDialog v-model:open="addDialogOpen" />
    <ShareDialog v-model:open="shareDialogOpen" />
    <SettingsDialog v-model:open="settingsDialogOpen" />

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

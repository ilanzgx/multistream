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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";

const addDialogOpen = ref(false);
const shareDialogOpen = ref(false);
const settingsDialogOpen = ref(false);
const appVersion = import.meta.env.VITE_APP_VERSION;

const { streams, addStream, clearStreams, gridClass } = useStreams();
const { selectedChat, sidebarOpen, setSelectedChat } = usePreferences();
const { checkForUpdates } = useUpdater();

const selectedChatData = computed(() =>
  streams.value.find((s) => s.channel === selectedChat.value),
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
  checkForUpdates();

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
          <h2 class="text-2xl text-white">{{ $t("empty.title") }}</h2>
          <p class="text-gray-400 text-sm text-center max-w-xs">
            {{ $t("empty.description") }}
          </p>
          <Button
            class="cursor-pointer"
            variant="outline"
            @click="addDialogOpen = true"
            >{{ $t("empty.addButton") }}</Button
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
          <p
            class="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-3 text-center"
          >
            {{ $t("chat.controlTitle") }}
          </p>
          <Select v-model="selectedChat">
            <SelectTrigger
              class="w-full bg-[#14161a] text-white border-[#2a2d33] hover:border-[#3a3f4b]"
            >
              <SelectValue :placeholder="$t('chat.selectPlaceholder')" />
            </SelectTrigger>
            <SelectContent class="bg-[#14161a] border-[#2a2d33]">
              <SelectGroup>
                <SelectItem
                  v-for="stream in streams"
                  :key="stream.id"
                  :value="stream.channel"
                  class="text-white focus:bg-[#2a2d33] focus:text-white cursor-pointer"
                >
                  {{ stream.channel }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
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
              {{ $t("chat.selectPrompt") }}
            </p>
          </div>
          <div
            v-else-if="streams.length === 0"
            class="flex items-center justify-center h-full text-muted-foreground"
          >
            <p class="text-center px-4 text-white">
              {{ $t("chat.noStreams") }}<br />{{ $t("chat.noStreamsHint") }}
            </p>
          </div>
        </div>

        <!-- action buttons -->
        <div class="p-5 border-t border-[#1f2227]">
          <TooltipProvider>
            <div class="grid grid-cols-4 gap-3">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    class="h-11 w-full rounded-xl border-[#2a2d33] bg-[#14161a] hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-all duration-200 hover:scale-105"
                    variant="outline"
                    @click="addDialogOpen = true"
                  >
                    <UserPlus2 class="size-5 text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{{ $t("add.tooltip") }}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    class="h-11 w-full rounded-xl border-[#2a2d33] bg-[#14161a] hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-all duration-200 hover:scale-105"
                    variant="outline"
                    @click="settingsDialogOpen = true"
                  >
                    <Settings2 class="size-5 text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{{ $t("settings.title") }}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    class="h-11 w-full rounded-xl border-[#2a2d33] bg-[#14161a] hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-all duration-200 hover:scale-105"
                    variant="outline"
                    @click="shareDialogOpen = true"
                  >
                    <Share2 class="size-5 text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{{ $t("share.tooltip") }}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    class="h-11 w-full rounded-xl border-[#2a2d33] bg-[#14161a] hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-all duration-200 hover:scale-105"
                    variant="outline"
                    @click="sidebarOpen = !sidebarOpen"
                  >
                    <PanelRightClose class="size-5 text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{{ $t("hide.tooltip") }}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          <!-- version -->
          <div
            v-if="appVersion"
            class="mt-5 flex items-center justify-center gap-3"
          >
            <div
              class="h-px flex-1 bg-linear-to-r from-transparent to-[#2a2d33]"
            ></div>
            <span
              class="text-[10px] font-semibold tracking-widest uppercase text-gray-500 select-none"
            >
              v{{ appVersion }}
            </span>
            <div
              class="h-px flex-1 bg-linear-to-l from-transparent to-[#2a2d33]"
            ></div>
          </div>
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

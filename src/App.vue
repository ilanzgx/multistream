<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { Button } from "./components/ui/button";
import KickChat from "./components/chat/KickChat.vue";
import KickStream from "./components/stream/KickStream.vue";
import TwitchChat from "./components/chat/TwitchChat.vue";
import TwitchStream from "./components/stream/TwitchStream.vue";
import YoutubeStream from "./components/stream/YoutubeStream.vue";
import YoutubeChat from "./components/chat/YoutubeChat.vue";
import CustomStream from "./components/stream/CustomStream.vue";
import AddDialog from "./components/dialogs/AddDialog.vue";
import ShareDialog from "./components/dialogs/ShareDialog.vue";
import ImportDialog from "./components/dialogs/ImportDialog.vue";
import SettingsDialog from "./components/dialogs/SettingsDialog.vue";
import {
  UserPlus2,
  Settings2,
  Share2,
  ImportIcon as Import,
  PanelRightClose,
} from "lucide-vue-next";
import { useStreams, type Platform } from "./composables/useStreams";
import { usePreferences } from "./composables/usePreferences";
import { useUpdater } from "./composables/useUpdater";
import { useLiveStatus } from "./composables/useLiveStatus";
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
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { PLATFORMS } from "./config/platforms";

const addDialogOpen = ref(false);
const shareDialogOpen = ref(false);
const importDialogOpen = ref(false);
const settingsDialogOpen = ref(false);
const appVersion = import.meta.env.VITE_APP_VERSION;

const { streams, addStream, clearStreams, gridClass } = useStreams();
const { selectedChat, sidebarOpen, setSelectedChat } = usePreferences();
const { checkForUpdates } = useUpdater();
const { suggestedStreams, refreshSuggestions, isLoadingSuggestions } =
  useLiveStatus();
const { locale } = useI18n();

const formatViewers = (count?: number) => {
  if (!count) return "";
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
};

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
          <CustomStream
            v-else-if="stream.platform === 'custom'"
            :channel="stream.channel"
            :channelid="stream.id"
            :iframeUrl="stream.iframeUrl || ''"
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

          <div
            v-if="suggestedStreams.length && !isLoadingSuggestions"
            class="mt-8 flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full max-w-4xl px-4"
          >
            <div
              class="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-widest select-none"
            >
              <span class="w-8 h-px bg-gray-700"></span>
              {{ $t("add.suggestions") }}
              <span class="w-8 h-px bg-gray-700"></span>
            </div>

            <div class="flex flex-wrap justify-center gap-4 w-full">
              <button
                v-for="stream in suggestedStreams"
                :key="`${stream.platform}:${stream.channel}`"
                class="group relative flex flex-col w-44 overflow-hidden rounded-xl bg-[#14161a] border border-[#2a2d33] transition-all duration-300 hover:border-[#3a3f4b] hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50 cursor-pointer text-left"
                @click="addStream(stream.channel, stream.platform)"
              >
                <!-- Thumbnail -->
                <div
                  class="relative aspect-video w-full bg-[#0f1115] overflow-hidden"
                >
                  <img
                    v-if="stream.thumbnail"
                    :src="
                      stream.thumbnail
                        .replace('{width}', '640')
                        .replace('{height}', '360')
                    "
                    class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-90 group-hover:opacity-100"
                    alt=""
                  />
                  <!-- Gradient Overlay -->
                  <div
                    class="absolute inset-0 bg-linear-to-t from-[#14161a] via-transparent to-transparent opacity-80"
                  ></div>

                  <!-- Live Badge -->
                  <div
                    class="absolute top-2 left-2 flex items-center gap-1.5 px-1 rounded bg-red-600 shadow-lg shadow-red-900/20"
                  >
                    <span class="relative flex h-2 w-2">
                      <span
                        class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"
                      ></span>
                      <span
                        class="relative inline-flex rounded-full h-2 w-2 bg-white"
                      ></span>
                    </span>
                    <span class="text-[10px] font-bold text-white tracking-wide"
                      >LIVE</span
                    >
                  </div>

                  <!-- Viewers -->
                  <div
                    class="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 text-[11px] font-medium text-white/90 tabular-nums"
                  >
                    {{ formatViewers(stream.viewerCount) }} viewers
                  </div>
                </div>

                <!-- Info -->
                <div class="p-4 pt-3 flex flex-col gap-1 relative z-10">
                  <div class="flex items-center justify-between gap-2">
                    <span
                      class="text-sm font-bold text-white truncate max-w-35"
                      :title="stream.channel"
                      >{{ stream.channel }}</span
                    >
                    <component
                      v-if="PLATFORMS[stream.platform]"
                      :is="PLATFORMS[stream.platform]?.icon"
                      :size="16"
                      :style="{ color: PLATFORMS[stream.platform]?.color }"
                    />
                  </div>
                  <p
                    class="text-xs text-gray-400 truncate"
                    :title="stream.category"
                  >
                    {{ stream.category }}
                  </p>
                  <p
                    class="text-[11px] text-gray-500 truncate mt-1 group-hover:text-gray-300 transition-colors"
                    :title="stream.title"
                  >
                    {{ stream.title }}
                  </p>
                </div>
              </button>
            </div>
          </div>
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
            <div class="grid grid-cols-5 gap-3">
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
                    @click="importDialogOpen = true"
                  >
                    <Import class="size-5 text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{{ $t("import.tooltip") }}</p>
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
    <ImportDialog v-model:open="importDialogOpen" />
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

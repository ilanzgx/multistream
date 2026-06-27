<script lang="ts" setup>
import { ref, onMounted, onUnmounted, computed, defineAsyncComponent, watch } from "vue";
import { usePreferences } from "@/composables/usePreferences";
import { useStreams } from "@/composables/useStreams";
import { useTranscription } from "@/composables/useTranscription";
import { useUnifiedChatState } from "@/composables/useUnifiedChatState";
import { isTauri } from "@/composables/useUpdater";
import { Button } from "@/components/ui/button";
const KickChat = defineAsyncComponent(() => import("@/components/chat/KickChat.vue"));
const TwitchChat = defineAsyncComponent(() => import("@/components/chat/TwitchChat.vue"));
const YoutubeChat = defineAsyncComponent(() => import("@/components/chat/YoutubeChat.vue"));
const UnifiedChat = defineAsyncComponent(() => import("@/components/chat/UnifiedChat.vue"));
const TranscriptView = defineAsyncComponent(() => import("@/components/chat/TranscriptView.vue"));

const AddDialog = defineAsyncComponent(() => import("@/components/dialogs/AddDialog.vue"));
const ShareDialog = defineAsyncComponent(() => import("@/components/dialogs/ShareDialog.vue"));
const ImportDialog = defineAsyncComponent(() => import("@/components/dialogs/ImportDialog.vue"));
const SettingsDialog = defineAsyncComponent(
  () => import("@/components/dialogs/SettingsDialog.vue")
);

import { UNIFIED_CHAT_ID } from "@/composables/useUnifiedChat";
import { KickIcon, TwitchIcon, YoutubeIcon, CustomIcon } from "@/components/icons";

const platformIcons: Record<string, any> = {
  twitch: TwitchIcon,
  kick: KickIcon,
  youtube: YoutubeIcon,
  custom: CustomIcon,
};
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UserPlus2,
  Settings2,
  Share2,
  ImportIcon as Import,
  PanelRightClose,
  Loader2,
} from "lucide-vue-next";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const addDialogOpen = ref(false);
const shareDialogOpen = ref(false);
const importDialogOpen = ref(false);
const settingsDialogOpen = ref(false);

const hasOpenedAdd = ref(false);
const hasOpenedShare = ref(false);
const hasOpenedImport = ref(false);
const hasOpenedSettings = ref(false);

watch(
  addDialogOpen,
  (v) => {
    if (v) hasOpenedAdd.value = true;
  },
  { immediate: true }
);
watch(
  shareDialogOpen,
  (v) => {
    if (v) hasOpenedShare.value = true;
  },
  { immediate: true }
);
watch(
  importDialogOpen,
  (v) => {
    if (v) hasOpenedImport.value = true;
  },
  { immediate: true }
);
watch(
  settingsDialogOpen,
  (v) => {
    if (v) hasOpenedSettings.value = true;
  },
  { immediate: true }
);

const appVersion = import.meta.env.VITE_APP_VERSION;
const sidebarMode = ref<"chat" | "transcript">("chat");

const hasLoadedUnifiedChat = ref(false);
const hasLoadedTranscript = ref(false);

const { streams } = useStreams();
const { unifiedChatState } = useUnifiedChatState();
const { selectedChat, sidebarOpen } = usePreferences();

watch(
  selectedChat,
  (v) => {
    if (v === UNIFIED_CHAT_ID) hasLoadedUnifiedChat.value = true;
  },
  { immediate: true }
);
watch(
  sidebarMode,
  (v) => {
    if (v === "transcript") hasLoadedTranscript.value = true;
  },
  { immediate: true }
);

watch(
  () => streams.value.length,
  (len) => {
    if (len === 1 && selectedChat.value === UNIFIED_CHAT_ID && streams.value[0]) {
      selectedChat.value = streams.value[0].channel;
    }
  }
);
const {
  isActive: transcriptionActive,
  isSupported,
  status: transcriptionStatus,
} = useTranscription();

const selectedStreamObj = computed(() =>
  streams.value.find((s) => s.channel === selectedChat.value)
);

function openAddDialog() {
  addDialogOpen.value = true;
}

defineExpose({ openAddDialog });

function handleShortcutEvent(e: Event) {
  const evt = e as CustomEvent;
  if (evt.detail === "add-stream") {
    openAddDialog();
  }
}

onMounted(() => {
  window.addEventListener("multistream-show-dialog", handleShortcutEvent);
});

onUnmounted(() => {
  window.removeEventListener("multistream-show-dialog", handleShortcutEvent);
});
</script>

<template>
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
        <div
          class="flex items-center mb-3 px-1 transition-all duration-300"
          :class="transcriptionActive ? 'justify-between' : 'justify-center'"
        >
          <p class="text-[10px] font-semibold tracking-widest uppercase text-gray-400">
            {{ $t("chat.controlTitle") }}
          </p>
          <div
            v-if="transcriptionActive"
            class="flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono tracking-wider uppercase transition-all duration-300 border"
            :class="{
              'bg-green-500/10 border-green-500/20 text-green-400':
                transcriptionStatus === 'active' || transcriptionStatus === 'processing',
              'bg-red-500/10 border-red-500/20 text-red-400': transcriptionStatus === 'error',
            }"
          >
            <Loader2 v-if="transcriptionStatus === 'processing'" class="h-2.5 w-2.5 animate-spin" />
            <div
              v-else
              class="h-1.5 w-1.5 rounded-full"
              :class="{
                'bg-green-500/80 animate-pulse': transcriptionStatus === 'active',
                'bg-red-500/80': transcriptionStatus === 'error',
              }"
            ></div>
            {{
              transcriptionStatus === "error"
                ? $t("settings.transcription.errorIndicator")
                : $t("settings.transcription.activeIndicator")
            }}
          </div>
        </div>

        <Tabs v-if="isTauri()" v-model="sidebarMode" class="w-full">
          <TabsList class="grid w-full grid-cols-2 bg-[#1e2127]">
            <TabsTrigger
              value="chat"
              class="data-[state=active]:bg-[#2a2d33] data-[state=active]:text-white text-gray-400"
            >
              {{ $t("chat.tabs.chat") }}
            </TabsTrigger>
            <TabsTrigger
              v-if="isSupported"
              value="transcript"
              class="data-[state=active]:bg-[#2a2d33] data-[state=active]:text-white text-gray-400"
            >
              {{ $t("chat.tabs.transcript") }}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div v-show="sidebarMode === 'chat'" class="mt-3">
          <Select v-model="selectedChat">
            <SelectTrigger
              class="w-full bg-[#14161a] text-white border-[#2a2d33] hover:border-[#3a3f4b]"
            >
              <SelectValue :placeholder="$t('chat.selectPlaceholder')">
                <div v-if="selectedChat === UNIFIED_CHAT_ID" class="flex items-center gap-2">
                  <div class="flex items-center -space-x-1 shrink-0">
                    <component
                      :is="platformIcons[platform]"
                      v-for="platform in unifiedChatState.activePlatforms"
                      :key="platform"
                      class="w-4 h-4"
                      :class="{
                        'text-[#bf94ff]': platform === 'twitch',
                        'text-[#53fc18]': platform === 'kick',
                      }"
                    />
                  </div>
                  <span class="truncate">{{ $t("chat.unified.selectorLabel") }}</span>
                </div>
                <div v-else-if="selectedStreamObj" class="flex items-center gap-2">
                  <component
                    :is="platformIcons[selectedStreamObj.platform]"
                    class="w-4 h-4 shrink-0"
                  />
                  <span class="truncate">{{ selectedStreamObj.channel }}</span>
                </div>
                <span v-else>{{ $t("chat.selectPlaceholder") }}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent class="bg-[#14161a] border-[#2a2d33]">
              <SelectGroup>
                <SelectItem
                  v-for="stream in streams"
                  :key="stream.id"
                  :value="stream.channel"
                  class="text-white focus:bg-[#2a2d33] focus:text-white cursor-pointer"
                >
                  <div class="flex items-center gap-2">
                    <component :is="platformIcons[stream.platform]" class="w-4 h-4 shrink-0" />
                    <span class="truncate">{{ stream.channel }}</span>
                  </div>
                </SelectItem>
                <SelectItem
                  v-if="unifiedChatState.showUnifiedChat"
                  :value="UNIFIED_CHAT_ID"
                  class="text-white focus:bg-[#2a2d33] focus:text-white cursor-pointer border-t border-[#2a2d33] mt-1 pt-1"
                >
                  <div class="flex items-center gap-2">
                    <div class="flex items-center -space-x-1 shrink-0">
                      <component
                        :is="platformIcons[platform]"
                        v-for="platform in unifiedChatState.activePlatforms"
                        :key="platform"
                        class="w-4 h-4"
                        :class="{
                          'text-[#bf94ff]': platform === 'twitch',
                          'text-[#53fc18]': platform === 'kick',
                        }"
                      />
                    </div>
                    <span class="truncate">{{ $t("chat.unified.selectorLabel") }}</span>
                  </div>
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <!-- chat / transcript area -->
      <div class="relative flex-1 overflow-hidden flex flex-col">
        <div v-show="sidebarMode === 'chat'" class="absolute inset-0">
          <KickChat
            v-for="stream in streams.filter((s) => s.platform === 'kick')"
            v-show="selectedChat === stream.channel"
            :key="`chat-${stream.id}`"
            :channel="stream.channel"
          />
          <TwitchChat
            v-for="stream in streams.filter((s) => s.platform === 'twitch')"
            v-show="selectedChat === stream.channel"
            :key="`chat-${stream.id}`"
            :channel="stream.channel"
          />
          <YoutubeChat
            v-for="stream in streams.filter((s) => s.platform === 'youtube')"
            v-show="selectedChat === stream.channel"
            :key="`chat-${stream.id}`"
            :channel="stream.channel"
          />
          <UnifiedChat v-if="hasLoadedUnifiedChat" v-show="selectedChat === UNIFIED_CHAT_ID" />
          <div
            v-if="streams.length === 0"
            class="absolute inset-0 flex items-center justify-center text-muted-foreground bg-[#0f1115]"
          >
            <p class="text-center px-4 text-sm text-gray-400">
              {{ $t("chat.noStreams") }}<br />
              <span class="text-xs text-gray-400 mt-1 inline-block">{{
                $t("chat.noStreamsHint")
              }}</span>
            </p>
          </div>
          <div
            v-else-if="!selectedChat"
            class="absolute inset-0 flex items-center justify-center text-muted-foreground bg-[#0f1115]"
          >
            <p class="text-center px-4 text-sm text-gray-400">
              {{ $t("chat.selectPrompt") }}
            </p>
          </div>
        </div>

        <div v-show="sidebarMode === 'transcript' && isSupported" class="absolute inset-0">
          <TranscriptView v-if="hasLoadedTranscript" />
        </div>
      </div>

      <!-- action buttons -->
      <div class="p-5 border-t border-[#1f2227]">
        <TooltipProvider>
          <div class="grid grid-cols-5 gap-3">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  data-testid="add-stream-btn"
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
                  data-testid="settings-btn"
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
                  data-testid="share-dialog-btn"
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
                  data-testid="import-dialog-btn"
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
        <div v-if="appVersion" class="mt-5 flex items-center justify-center gap-3">
          <div class="h-px flex-1 bg-linear-to-r from-transparent to-[#2a2d33]" />
          <span
            class="text-[10px] font-semibold tracking-widest uppercase text-gray-400 select-none"
          >
            v{{ appVersion }}
          </span>
          <div class="h-px flex-1 bg-linear-to-l from-transparent to-[#2a2d33]" />
        </div>
      </div>
    </div>
  </aside>

  <!-- dialogs -->
  <AddDialog v-if="hasOpenedAdd" v-model:open="addDialogOpen" />
  <ShareDialog v-if="hasOpenedShare" v-model:open="shareDialogOpen" />
  <ImportDialog v-if="hasOpenedImport" v-model:open="importDialogOpen" />
  <SettingsDialog v-if="hasOpenedSettings" v-model:open="settingsDialogOpen" />
</template>

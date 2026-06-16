<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from "vue";
import { usePreferences } from "@/composables/usePreferences";
import { useStreams } from "@/composables/useStreams";
import { useTranscription } from "@/composables/useTranscription";
import { Button } from "@/components/ui/button";
import KickChat from "@/components/chat/KickChat.vue";
import TwitchChat from "@/components/chat/TwitchChat.vue";
import YoutubeChat from "@/components/chat/YoutubeChat.vue";
import AddDialog from "@/components/dialogs/AddDialog.vue";
import ShareDialog from "@/components/dialogs/ShareDialog.vue";
import ImportDialog from "@/components/dialogs/ImportDialog.vue";
import SettingsDialog from "@/components/dialogs/SettingsDialog.vue";
import TranscriptView from "@/components/chat/TranscriptView.vue";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UserPlus2,
  Settings2,
  Share2,
  ImportIcon as Import,
  PanelRightClose,
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
const appVersion = import.meta.env.VITE_APP_VERSION;
const sidebarMode = ref<"chat" | "transcript">("chat");

const { streams } = useStreams();
const { selectedChat, sidebarOpen } = usePreferences();
const { isActive: transcriptionActive } = useTranscription();

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
          <p class="text-[10px] font-semibold tracking-widest uppercase text-gray-500">
            {{ $t("chat.controlTitle") }}
          </p>
          <div
            v-if="transcriptionActive"
            class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-[9px] font-mono tracking-wider uppercase transition-all duration-300"
          >
            <div class="h-1.5 w-1.5 rounded-full bg-green-500/80 animate-pulse"></div>
            {{ $t("settings.transcription.activeIndicator") }}
          </div>
        </div>

        <Tabs v-model="sidebarMode" class="w-full">
          <TabsList class="grid w-full grid-cols-2 bg-[#1e2127]">
            <TabsTrigger
              value="chat"
              class="data-[state=active]:bg-[#2a2d33] data-[state=active]:text-white text-gray-400"
            >
              {{ $t("chat.tabs.chat") }}
            </TabsTrigger>
            <TabsTrigger
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
          <div
            v-if="streams.length === 0"
            class="absolute inset-0 flex items-center justify-center text-muted-foreground"
          >
            <p class="text-center px-4 text-white">
              {{ $t("chat.noStreams") }}<br />{{ $t("chat.noStreamsHint") }}
            </p>
          </div>
          <div
            v-else-if="!selectedChat"
            class="absolute inset-0 flex items-center justify-center text-muted-foreground"
          >
            <p class="text-center px-4 text-white">
              {{ $t("chat.selectPrompt") }}
            </p>
          </div>
        </div>

        <div v-show="sidebarMode === 'transcript'" class="absolute inset-0">
          <TranscriptView />
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
            class="text-[10px] font-semibold tracking-widest uppercase text-gray-500 select-none"
          >
            v{{ appVersion }}
          </span>
          <div class="h-px flex-1 bg-linear-to-l from-transparent to-[#2a2d33]" />
        </div>
      </div>
    </div>
  </aside>

  <!-- dialogs -->
  <AddDialog v-model:open="addDialogOpen" />
  <ShareDialog v-model:open="shareDialogOpen" />
  <ImportDialog v-model:open="importDialogOpen" />
  <SettingsDialog v-model:open="settingsDialogOpen" />
</template>

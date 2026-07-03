<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Button from "../ui/button/Button.vue";
import { Switch } from "@/components/ui/switch";
import { useUpdater, isTauri } from "@/composables/useUpdater";
import { usePreferences } from "@/composables/usePreferences";
import {
  RefreshCw,
  Download,
  Globe,
  Bell,
  Database,
  Upload,
  HelpCircle,
  Settings,
  Puzzle,
  Link,
  Trash2,
  Check,
  Captions,
  X,
  LogOut,
} from "@lucide/vue";
import { toast } from "vue-sonner";
import { watch, ref } from "vue";
import { useBackup } from "@/composables/useBackup";
import type { BackupData } from "@/composables/useBackup";
import { useI18n } from "vue-i18n";
import { SUPPORTED_LANGUAGES } from "@/config/i18n";
import { PLATFORMS } from "@/config/platforms";
import { useTranscription, CHUNK_STEPS } from "@/composables/useTranscription";
import { Slider } from "@/components/ui/slider";

const { checkForUpdates, isChecking } = useUpdater();
const { notificationsEnabled } = usePreferences();
const { locale, t } = useI18n();

import { useTwitchAuth } from "@/composables/useTwitchAuth";
const {
  authenticated: twitchAuthenticated,
  username: twitchUsername,
  logout: twitchLogout,
} = useTwitchAuth();

import { useKickAuth } from "@/composables/useKickAuth";
const {
  authenticated: kickAuthenticated,
  username: kickUsername,
  logout: kickLogout,
} = useKickAuth();

const openAuthModal = () => {
  window.dispatchEvent(
    new CustomEvent("multistream-show-dialog", {
      detail: "twitch-auth",
    })
  );
  emit("update:open", false);
};

const openKickAuthModal = () => {
  window.dispatchEvent(
    new CustomEvent("multistream-show-dialog", {
      detail: "kick-auth",
    })
  );
  emit("update:open", false);
};

const {
  isSupported,
  installedModels,
  selectedModel,
  isEnabled,
  captionMode,
  chunkDuration,
  isDownloading,
  downloadingModel,
  downloadProgress,
  downloadModel,
  cancelDownload,
  deleteModel,
  setChunkDuration,
} = useTranscription();

const AVAILABLE_MODELS = [
  { id: "tiny", name: "Tiny", size: "75MB", tKey: "settings.transcription.modelTiny" },
  { id: "base", name: "Base", size: "142MB", tKey: "settings.transcription.modelBase" },
  { id: "small", name: "Small", size: "466MB", tKey: "settings.transcription.modelSmall" },
];

const isRunningInTauri = isTauri();

const languages = Object.values(SUPPORTED_LANGUAGES);

const changeLanguage = (lang: string) => {
  locale.value = lang;
  localStorage.setItem("locale", lang);
};

defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const handleCheckUpdates = () => {
  checkForUpdates(true);
};

const startTour = () => {
  window.dispatchEvent(
    new CustomEvent("multistream-show-dialog", {
      detail: "onboarding-tour",
    })
  );
  emit("update:open", false);
};

const { exportConfig, importConfig, validateBackupData } = useBackup();
const showImportConfirm = ref(false);
const pendingBackupData = ref<BackupData | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const handleExport = async () => {
  const success = await exportConfig();
  if (success) {
    toast.success(t("settings.backup.exportSuccess"));
    emit("update:open", false);
  }
};

const processImportContent = (content: string) => {
  try {
    const data = JSON.parse(content);
    if (validateBackupData(data)) {
      pendingBackupData.value = data;
      showImportConfirm.value = true;
    } else {
      toast.error(t("settings.backup.importError"));
    }
  } catch (err) {
    toast.error(t("settings.backup.importError"));
  }
};

const handleImportClick = async () => {
  if (isRunningInTauri && (window as any).__TAURI_INTERNALS__) {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const { downloadDir } = await import("@tauri-apps/api/path");

      const dlDir = await downloadDir();

      const filePath = await open({
        defaultPath: dlDir,
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (filePath && typeof filePath === "string") {
        const content = await readTextFile(filePath);
        processImportContent(content);
        return;
      } else {
        return; // User cancelled
      }
    } catch (err: any) {
      console.error("Tauri native open failed, falling back to html input:", err);
    }
  }
  // Fallback to web native input
  triggerFileInput();
};

const handleFileImport = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", (event) => {
    if (typeof event.target?.result === "string") {
      processImportContent(event.target.result);
    } else {
      toast.error(t("settings.backup.importError"));
    }
    input.value = "";
  });
  reader.addEventListener("error", () => {
    toast.error(t("settings.backup.importError"));
    input.value = "";
  });
  reader.readAsText(file);
};

const confirmImport = () => {
  if (pendingBackupData.value) {
    importConfig(pendingBackupData.value);
    toast.success(t("settings.backup.importSuccess"));
    pendingBackupData.value = null;
    showImportConfirm.value = false;
    emit("update:open", false);
  }
};

const cancelImport = () => {
  pendingBackupData.value = null;
  showImportConfirm.value = false;
};

watch(notificationsEnabled, (enabled) => {
  if (enabled) {
    toast.success(t("settings.notifications.enabled"), {
      duration: 2000,
    });
  } else {
    toast.info(t("settings.notifications.disabled"), {
      duration: 2000,
    });
  }
});

// all platforms except custom
const authPlatforms = Object.values(PLATFORMS).filter((p) => p.id !== "custom");
</script>

<template>
  <Dialog :open="open" :modal="false" @update:open="emit('update:open', $event)">
    <DialogContent
      class="bg-[#14161a] border-[#2a2d33] max-w-xl md:max-w-2xl flex flex-col h-[780px] max-h-[90vh]"
    >
      <DialogHeader>
        <DialogTitle class="text-white">
          {{ $t("settings.title") }}
        </DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ $t("settings.description") }}
        </DialogDescription>
      </DialogHeader>

      <Tabs default-value="geral" class="flex flex-col flex-1 overflow-hidden mt-2">
        <TabsList
          :class="[
            'grid w-full bg-[#1e2127]',
            isRunningInTauri && isSupported ? 'grid-cols-4' : 'grid-cols-3',
          ]"
        >
          <TabsTrigger
            value="geral"
            class="flex items-center gap-2 text-gray-400 hover:text-white dark:text-gray-400 dark:hover:text-white data-[state=active]:bg-[#2a2d33] data-[state=active]:text-white dark:data-[state=active]:text-white"
          >
            <Settings class="size-4" />
            {{ $t("settings.tabs.general") }}
          </TabsTrigger>

          <TabsTrigger
            value="dados"
            class="flex items-center gap-2 text-gray-400 hover:text-white dark:text-gray-400 dark:hover:text-white data-[state=active]:bg-[#2a2d33] data-[state=active]:text-white dark:data-[state=active]:text-white"
          >
            <Database class="size-4" />
            {{ $t("settings.tabs.data") }}
          </TabsTrigger>
          <TabsTrigger
            value="conexoes"
            class="flex items-center gap-2 text-gray-400 hover:text-white dark:text-gray-400 dark:hover:text-white data-[state=active]:bg-[#2a2d33] data-[state=active]:text-white dark:data-[state=active]:text-white"
          >
            <Link class="size-4" />
            {{ $t("settings.tabs.connections") }}
          </TabsTrigger>
          <TabsTrigger
            v-if="isRunningInTauri && isSupported"
            value="recursos"
            class="flex items-center gap-2 text-gray-400 hover:text-white dark:text-gray-400 dark:hover:text-white data-[state=active]:bg-[#2a2d33] data-[state=active]:text-white dark:data-[state=active]:text-white"
          >
            <Puzzle class="size-4" />
            {{ $t("settings.tabs.resources") }}
          </TabsTrigger>
        </TabsList>

        <div class="flex-1 overflow-y-auto mt-4 pr-1 scrollbar-thin">
          <TabsContent value="geral" class="space-y-6 mt-0 outline-none">
            <!-- Language Section -->
            <div class="space-y-2">
              <div class="flex items-center gap-2 px-1">
                <Globe class="size-4 text-gray-400" />
                <div>
                  <h3 class="text-white text-sm font-medium">
                    {{ $t("settings.language.title") }}
                  </h3>
                  <p class="text-gray-400 text-xs">{{ $t("settings.language.description") }}</p>
                </div>
              </div>
              <div
                class="border border-[#2a2d33]/60 bg-[#14161a] p-3 rounded-xl flex items-center justify-start"
              >
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 w-full">
                  <button
                    v-for="lang in languages"
                    :key="lang.code"
                    class="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-all duration-200 cursor-pointer w-full"
                    :class="
                      locale === lang.code
                        ? 'bg-[#2a2d33] text-white border border-white/20 shadow-sm'
                        : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                    "
                    @click="changeLanguage(lang.code)"
                  >
                    <component :is="lang.flag" :size="14" />
                    <span>{{ lang.label }}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Notifications Section -->
            <div v-if="isRunningInTauri" class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-2 px-1">
                <Bell class="size-4 text-gray-400 shrink-0" />
                <div>
                  <h3 class="text-white text-sm font-medium">
                    {{ $t("settings.notifications.title") }}
                  </h3>
                  <p class="text-gray-400 text-xs">
                    {{ $t("settings.notifications.description") }}
                  </p>
                </div>
              </div>
              <div class="shrink-0 bg-[#14161a] p-2 rounded-xl flex items-center">
                <Switch v-model="notificationsEnabled" />
              </div>
            </div>

            <!-- Updates Section -->
            <div v-if="isRunningInTauri" class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-2 px-1">
                <Download class="size-4 text-gray-400 shrink-0" />
                <div>
                  <h3 class="text-white text-sm font-medium">{{ $t("settings.updates.title") }}</h3>
                  <p class="text-gray-400 text-xs">{{ $t("settings.updates.description") }}</p>
                </div>
              </div>
              <div class="shrink-0 bg-[#14161a] p-2 rounded-xl flex items-center">
                <Button
                  variant="outline"
                  size="sm"
                  class="border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] transition-all duration-200"
                  :disabled="isChecking"
                  @click="handleCheckUpdates"
                >
                  <RefreshCw class="size-4 mr-2" :class="{ 'animate-spin': isChecking }" />
                  {{
                    isChecking
                      ? $t("settings.updates.checking")
                      : $t("settings.updates.checkButton")
                  }}
                </Button>
              </div>
            </div>

            <!-- Help / Tour Section -->
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-2 px-1">
                <HelpCircle class="size-4 text-gray-400 shrink-0" />
                <div>
                  <h3 class="text-white text-sm font-medium">{{ $t("settings.help.title") }}</h3>
                  <p class="text-gray-400 text-xs">{{ $t("settings.help.description") }}</p>
                </div>
              </div>
              <div class="shrink-0 bg-[#14161a] p-2 rounded-xl flex items-center">
                <Button
                  variant="outline"
                  size="sm"
                  class="border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] transition-all duration-200"
                  @click="startTour"
                >
                  {{ $t("settings.help.showTourButton") }}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="conexoes" class="space-y-6 mt-0 outline-none">
            <!-- Accounts / Platforms Section -->
            <div class="space-y-2 relative">
              <div class="flex items-center gap-2 px-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="size-4 text-gray-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="text-white text-sm font-medium">{{ $t("settings.auth.title") }}</h3>
                    <!--<span class="text-[10px] text-gray-400 font-medium"
                      >({{ $t("common.comingSoon") }})</span
                    >-->
                  </div>
                  <p class="text-gray-400 text-xs mt-0.5">{{ $t("settings.auth.description") }}</p>
                </div>
              </div>
              <div class="border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl">
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 w-full">
                  <template v-for="platform in authPlatforms" :key="platform.id">
                    <template v-if="platform.id === 'twitch'">
                      <div
                        v-if="twitchAuthenticated"
                        class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#9146FF]/30 bg-[#9146FF]/10 text-xs font-medium transition-all duration-200"
                      >
                        <span :style="{ color: platform.color }" class="shrink-0">
                          <component :is="platform.icon" :size="14" />
                        </span>
                        <span class="text-white font-medium truncate max-w-[100px]">{{
                          twitchUsername
                        }}</span>
                        <button
                          class="ml-auto text-gray-400 hover:text-red-400 p-1 rounded transition-colors"
                          :title="$t('settings.auth.logout')"
                          @click="twitchLogout"
                        >
                          <LogOut class="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        v-else
                        class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#2a2d33] bg-[#1e2127] hover:bg-[#2a2d33] text-xs font-medium text-gray-300 transition-all duration-200"
                        @click="openAuthModal"
                      >
                        <span :style="{ color: platform.color }" class="shrink-0">
                          <component :is="platform.icon" :size="14" />
                        </span>
                        <span class="text-white font-medium">{{ platform.name }}</span>
                        <span
                          class="ml-auto text-[8px] font-mono tracking-wider uppercase px-1.5 py-0.5 rounded text-gray-300 bg-white/10 border border-white/10"
                        >
                          {{ $t("chat.unified.connectButton") }}
                        </span>
                      </button>
                    </template>
                    <template v-else-if="platform.id === 'kick'">
                      <div
                        v-if="kickAuthenticated"
                        class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#53FC18]/30 bg-[#53FC18]/10 text-xs font-medium transition-all duration-200"
                      >
                        <span :style="{ color: platform.color }" class="shrink-0">
                          <component :is="platform.icon" :size="14" />
                        </span>
                        <span class="text-white font-medium truncate max-w-[100px]">{{
                          kickUsername
                        }}</span>
                        <button
                          class="ml-auto text-gray-400 hover:text-red-400 p-1 rounded transition-colors"
                          :title="$t('settings.auth.logout')"
                          @click="kickLogout"
                        >
                          <LogOut class="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        v-else
                        class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#2a2d33] bg-[#1e2127] hover:bg-[#2a2d33] text-xs font-medium text-gray-300 transition-all duration-200"
                        @click="openKickAuthModal"
                      >
                        <span :style="{ color: platform.color }" class="shrink-0">
                          <component :is="platform.icon" :size="14" />
                        </span>
                        <span class="text-white font-medium">{{ platform.name }}</span>
                        <span
                          class="ml-auto text-[8px] font-mono tracking-wider uppercase px-1.5 py-0.5 rounded text-gray-300 bg-white/10 border border-white/10"
                        >
                          {{ $t("chat.unified.connectButton") }}
                        </span>
                      </button>
                    </template>
                    <button
                      v-else
                      class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#2a2d33] bg-[#1e2127] text-xs font-medium text-gray-400 transition-all duration-200 cursor-not-allowed opacity-35"
                      disabled
                    >
                      <span :style="{ color: platform.color }" class="shrink-0">
                        <component :is="platform.icon" :size="14" />
                      </span>
                      <span class="text-white font-medium">{{ platform.name }}</span>
                      <span
                        class="ml-auto text-[8px] font-mono tracking-wider uppercase px-1.5 py-0.5 rounded text-gray-400 bg-white/5 border border-white/5"
                      >
                        {{ $t("settings.auth.disconnected") }}
                      </span>
                    </button>
                  </template>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="dados" class="space-y-6 mt-0 outline-none">
            <!-- Data & Backup Section -->
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-2 px-1">
                <Database class="size-4 text-gray-400 shrink-0" />
                <div>
                  <h3 class="text-white text-sm font-medium">{{ $t("settings.backup.title") }}</h3>
                  <p class="text-gray-400 text-xs">{{ $t("settings.backup.description") }}</p>
                </div>
              </div>
              <div class="shrink-0 bg-[#14161a] p-2 rounded-xl flex items-center gap-2">
                <input
                  ref="fileInputRef"
                  type="file"
                  accept=".json"
                  class="hidden"
                  @change="handleFileImport"
                />
                <Button
                  variant="outline"
                  size="sm"
                  class="border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] transition-all duration-200"
                  @click="handleImportClick"
                >
                  <Upload class="size-4 mr-2" />
                  {{ $t("settings.backup.importButton") }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] transition-all duration-200"
                  @click="handleExport"
                >
                  <Download class="size-4 mr-2" />
                  {{ $t("settings.backup.exportButton") }}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent
            v-if="isRunningInTauri && isSupported"
            value="recursos"
            class="space-y-6 mt-0 outline-none"
          >
            <!-- Live Transcription Section -->
            <div v-if="isRunningInTauri && isSupported" class="space-y-2">
              <div class="flex items-center gap-2 px-1">
                <Captions class="size-4 text-gray-400 shrink-0" />
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="text-white text-sm font-medium">
                      {{ $t("settings.transcription.title") }}
                    </h3>
                  </div>
                  <p class="text-gray-400 text-xs mt-0.5">
                    {{ $t("settings.transcription.description") }}
                  </p>
                </div>
              </div>

              <div class="border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl space-y-4">
                <!-- Active Configuration -->
                <div
                  v-if="installedModels.length > 0"
                  class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#2a2d33]/50"
                >
                  <div class="flex items-center gap-2 flex-1">
                    <select
                      v-model="captionMode"
                      data-testid="transcription-mode-select"
                      class="bg-[#1e2127] border border-[#2a2d33] text-white text-xs rounded-md px-2 py-1.5 focus:outline-none focus:border-white/20 w-full max-w-[200px] disabled:opacity-50 disabled:cursor-not-allowed"
                      :disabled="isDownloading"
                    >
                      <option value="original">
                        {{ $t("settings.transcription.captionModeOriginal") }}
                      </option>
                      <option value="translate">
                        {{ $t("settings.transcription.captionModeTranslate") }}
                      </option>
                    </select>
                    <div class="text-[10px] text-gray-400">
                      {{ $t("settings.transcription.captionModeLabel") }}
                    </div>
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <span class="text-xs text-gray-400">{{
                      $t("settings.transcription.enableToggle")
                    }}</span>
                    <Switch
                      v-model="isEnabled"
                      data-testid="transcription-enable-toggle"
                      :disabled="isDownloading"
                    />
                  </div>
                </div>

                <!-- Caption Responsiveness slider -->
                <div class="space-y-1">
                  <div class="flex items-center justify-between">
                    <div class="text-xs font-medium text-gray-400">
                      {{ $t("settings.transcription.chunkDurationLabel") }}
                    </div>
                  </div>
                  <div dir="ltr" class="pt-1 pb-0.5">
                    <Slider
                      :model-value="[chunkDuration]"
                      :min="CHUNK_STEPS[0]"
                      :max="CHUNK_STEPS[CHUNK_STEPS.length - 1]"
                      :step="CHUNK_STEPS[1] - CHUNK_STEPS[0]"
                      data-testid="chunk-duration-slider"
                      class="w-full my-2"
                      :disabled="isDownloading"
                      @update:model-value="(val) => val && val[0] && setChunkDuration(val[0])"
                    />
                    <!-- Tick labels -->
                    <div class="flex justify-between w-full mt-1.5 px-1">
                      <span
                        v-for="step in CHUNK_STEPS"
                        :key="step"
                        class="text-[10px] font-mono transition-colors leading-none"
                        :class="
                          step === chunkDuration ? 'text-white font-semibold' : 'text-gray-400'
                        "
                        >{{ step }}s</span
                      >
                    </div>
                  </div>
                  <p class="text-[10px] text-gray-400 mt-1 leading-tight">
                    {{ $t("settings.transcription.chunkDurationHintLow") }}
                    {{ $t("settings.transcription.chunkDurationHintHigh") }}
                    <strong class="font-semibold text-gray-300">{{
                      $t("settings.transcription.chunkDurationHintRec")
                    }}</strong>
                  </p>
                </div>

                <!-- Models List -->
                <div class="space-y-2">
                  <div class="text-xs font-medium text-gray-400 mb-2">
                    {{ $t("settings.transcription.modelLabel") }}
                  </div>
                  <div
                    v-for="model in AVAILABLE_MODELS"
                    :key="model.id"
                    class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-[#2a2d33]/60 bg-[#1e2127]/50"
                  >
                    <div class="flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="text-sm font-medium text-white">{{ model.name }}</span>
                        <span class="text-[10px] text-gray-400 font-mono">{{ model.size }}</span>
                        <span
                          v-if="installedModels.includes(model.id)"
                          class="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 uppercase tracking-wider"
                          >{{ $t("settings.transcription.modelInstalled") }}</span
                        >
                        <span v-if="model.id === 'base'" class="text-[10px] text-gray-400"
                          >({{ $t("settings.transcription.recommendedBadge") }})</span
                        >
                      </div>
                      <p class="text-[10px] text-gray-400 mt-1">{{ $t(model.tKey) }}</p>
                    </div>

                    <div class="shrink-0 flex items-center gap-2">
                      <template v-if="downloadingModel === model.id">
                        <div class="w-[120px] space-y-1.5">
                          <div class="flex justify-between text-[9px] text-gray-400 font-mono">
                            <span
                              >{{ (downloadProgress.downloaded / 1024 / 1024).toFixed(1) }}M</span
                            >
                            <span>{{ downloadProgress.percent.toFixed(0) }}%</span>
                          </div>
                          <div class="flex items-center gap-2">
                            <div class="h-1 flex-1 bg-[#2a2d33] rounded-full overflow-hidden">
                              <div
                                class="h-full bg-blue-500 transition-all duration-300"
                                :style="{ width: `${downloadProgress.percent}%` }"
                              ></div>
                            </div>
                            <button
                              class="text-gray-400 hover:text-red-400 transition-colors p-0.5"
                              title="Cancelar download"
                              @click="cancelDownload"
                            >
                              <X class="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </template>
                      <template v-else-if="installedModels.includes(model.id)">
                        <span
                          v-if="selectedModel === model.id"
                          class="flex items-center text-[10px] px-3 rounded-md text-green-400 uppercase tracking-wider font-mono h-9 select-none"
                        >
                          <Check class="size-3.5 mr-1" />
                          {{ $t("settings.transcription.modelSelected") }}
                        </span>
                        <Button
                          v-else
                          variant="outline"
                          size="sm"
                          class="border-[#2a2d33] bg-[#2a2d33]/30 text-gray-300 hover:text-white hover:bg-[#3a3f4b] hover:border-[#4a4f5b]"
                          :disabled="isDownloading"
                          @click="selectedModel = model.id"
                        >
                          {{ $t("settings.transcription.modelSelect") }}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/10 px-2"
                          :disabled="isDownloading"
                          @click="deleteModel(model.id)"
                        >
                          <Trash2 class="size-4" />
                        </Button>
                      </template>
                      <template v-else>
                        <Button
                          variant="outline"
                          size="sm"
                          class="border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33]"
                          :disabled="isDownloading"
                          @click="downloadModel(model.id)"
                        >
                          <Download class="size-4 mr-1.5" />
                          {{ $t("settings.transcription.modelDownload") }}
                        </Button>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <DialogFooter class="pt-5 mt-2 border-t border-[#2a2d33]/50">
        <DialogClose as-child>
          <Button
            variant="outline"
            class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200"
          >
            {{ $t("common.close") }}
          </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>

    <!-- Confirm Import Dialog -->
    <Dialog v-model:open="showImportConfirm" :modal="false">
      <DialogContent class="bg-[#14161a] border-[#2a2d33] max-w-md">
        <DialogHeader>
          <DialogTitle class="text-white">
            {{ $t("settings.backup.importConfirmTitle") }}
          </DialogTitle>
          <DialogDescription class="text-gray-400">
            {{ $t("settings.backup.importConfirmDescription") }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="pt-4 border-t border-[#2a2d33]/50 flex gap-2 justify-end">
          <Button
            variant="outline"
            class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200"
            @click="cancelImport"
          >
            {{ $t("settings.backup.importConfirmCancel") }}
          </Button>
          <Button
            class="bg-[#ea580c] hover:bg-[#c2410c] text-white border-transparent transition-all duration-200 active:scale-[0.97]"
            @click="confirmImport"
          >
            {{ $t("settings.backup.importConfirmButton") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Dialog>
</template>

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
  Captions,
} from "lucide-vue-next";
import { toast } from "vue-sonner";
import { watch, ref, computed } from "vue";
import { useBackup } from "@/composables/useBackup";
import type { BackupData } from "@/composables/useBackup";

import { useI18n } from "vue-i18n";
import { SUPPORTED_LANGUAGES } from "@/config/i18n";
import { PLATFORMS } from "@/config/platforms";
import { useTranscription } from "@/composables/useTranscription";

const { checkForUpdates, isChecking } = useUpdater();
const { notificationsEnabled } = usePreferences();
const { locale, t } = useI18n();

const {
  isSupported,
  installedModels,
  selectedModel,
  isEnabled,
  captionMode,
  isDownloading,
  downloadProgress,
  isActive,
  downloadModel,
} = useTranscription();

const transcriptionStatus = computed(() => {
  if (isDownloading.value) return "downloading";
  if (isActive.value) return "active";
  if (installedModels.value.length > 0) return "ready";
  return "notInstalled";
});

const transcriptionStatusBadge = computed(() => {
  switch (transcriptionStatus.value) {
    case "notInstalled":
      return {
        text: t("settings.transcription.statusNotInstalled"),
        class: "text-gray-500 bg-white/5 border-white/5",
      };
    case "downloading":
      return {
        text: t("settings.transcription.statusDownloading"),
        class: "text-blue-400 bg-blue-500/10 border-blue-500/20",
      };
    case "ready":
      return {
        text: t("settings.transcription.statusReady"),
        class: "text-orange-400 bg-orange-500/10 border-orange-500/20",
      };
    case "active":
      return {
        text: t("settings.transcription.statusActive"),
        class: "text-green-400 bg-green-500/10 border-green-500/20",
      };
  }
  return { text: "", class: "" };
});

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

const handleFileImport = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target?.result as string);
      if (validateBackupData(data)) {
        pendingBackupData.value = data;
        showImportConfirm.value = true;
      } else {
        toast.error(t("settings.backup.importError"));
      }
    } catch (err) {
      toast.error(t("settings.backup.importError"));
    }
    input.value = "";
  };
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
    <DialogContent class="bg-[#14161a] border-[#2a2d33] max-w-xl md:max-w-2xl">
      <DialogHeader>
        <DialogTitle class="text-white">
          {{ $t("settings.title") }}
        </DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ $t("settings.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- Updates Section -->
        <div
          v-if="isRunningInTauri"
          class="flex items-center justify-between border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center size-10 rounded-lg bg-[#14161a] border border-[#2a2d33]"
            >
              <Download class="size-5 text-gray-400" />
            </div>
            <div>
              <p class="text-white text-sm font-medium">
                {{ $t("settings.updates.title") }}
              </p>
              <p class="text-gray-400 text-xs">
                {{ $t("settings.updates.description") }}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200 active:scale-[0.97]"
            :disabled="isChecking"
            @click="handleCheckUpdates"
          >
            <RefreshCw class="size-4 mr-2" :class="{ 'animate-spin': isChecking }" />
            {{ isChecking ? $t("settings.updates.checking") : $t("settings.updates.checkButton") }}
          </Button>
        </div>

        <!-- Language Section -->
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center size-10 rounded-lg bg-[#14161a] border border-[#2a2d33]"
            >
              <Globe class="size-5 text-gray-400" />
            </div>
            <div>
              <p class="text-white text-sm font-medium">
                {{ $t("settings.language.title") }}
              </p>
              <p class="text-gray-400 text-xs">
                {{ $t("settings.language.description") }}
              </p>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-1 w-full sm:w-auto">
            <button
              v-for="lang in languages"
              :key="lang.code"
              class="flex items-center justify-center sm:justify-start gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 cursor-pointer"
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

        <!-- Notifications Section -->
        <div
          v-if="isRunningInTauri"
          class="flex items-center justify-between border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center size-10 rounded-lg bg-[#14161a] border border-[#2a2d33]"
            >
              <Bell class="size-5 text-gray-400" />
            </div>
            <div>
              <p class="text-white text-sm font-medium">
                {{ $t("settings.notifications.title") }}
              </p>
              <p class="text-gray-400 text-xs">
                {{ $t("settings.notifications.description") }}
              </p>
            </div>
          </div>
          <Switch v-model="notificationsEnabled" />
        </div>

        <!-- Data & Backup Section -->
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center size-10 rounded-lg bg-[#14161a] border border-[#2a2d33] shrink-0"
            >
              <Database class="size-5 text-gray-400" />
            </div>
            <div>
              <p class="text-white text-sm font-medium">
                {{ $t("settings.backup.title") }}
              </p>
              <p class="text-gray-400 text-xs">
                {{ $t("settings.backup.description") }}
              </p>
            </div>
          </div>
          <div class="flex gap-2 w-full sm:w-auto shrink-0 justify-end">
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
              class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200 active:scale-[0.97]"
              @click="triggerFileInput"
            >
              <Upload class="size-4 mr-2" />
              {{ $t("settings.backup.importButton") }}
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200 active:scale-[0.97]"
              @click="handleExport"
            >
              <Download class="size-4 mr-2" />
              {{ $t("settings.backup.exportButton") }}
            </Button>
          </div>
        </div>

        <!-- Accounts / Platforms Section -->
        <div class="flex flex-col gap-4 border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl">
          <div class="flex items-center gap-3 pb-1 border-b border-[#2a2d33]/30">
            <div
              class="flex items-center justify-center size-10 rounded-lg bg-[#14161a] border border-[#2a2d33] shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="size-5 text-gray-400"
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
            </div>
            <div>
              <p class="text-white text-sm font-medium">
                {{ $t("settings.auth.title") }}
              </p>
              <p class="text-gray-400 text-xs">
                {{ $t("settings.auth.description") }}
              </p>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              v-for="platform in authPlatforms"
              :key="platform.id"
              class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#2a2d33] bg-[#14161a] text-xs font-medium text-gray-400 transition-all duration-200 cursor-not-allowed opacity-50"
              disabled
            >
              <span :style="{ color: platform.color }" class="shrink-0">
                <component :is="platform.icon" :size="14" />
              </span>
              <span class="text-white font-medium">{{ platform.name }}</span>
              <span
                class="ml-auto text-[8px] font-mono tracking-wider uppercase px-1.5 py-0.5 rounded text-gray-500 bg-white/5 border border-white/5"
              >
                {{ $t("settings.auth.disconnected") }}
              </span>
            </button>
          </div>
        </div>

        <!-- Help / Tour Section -->
        <!-- Live Transcription Section -->
        <div
          v-if="isRunningInTauri"
          class="flex flex-col gap-4 border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl"
        >
          <!-- Row 1: Header & Status -->
          <div
            class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#2a2d33]/30"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex items-center justify-center size-10 rounded-lg bg-[#14161a] border border-[#2a2d33] shrink-0"
              >
                <Captions class="size-5 text-gray-400" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <p class="text-white text-sm font-medium">
                    {{ $t("settings.transcription.title") }}
                  </p>
                  <span
                    class="text-[10px] font-mono tracking-wider uppercase px-1.5 py-0.5 rounded border"
                    :class="transcriptionStatusBadge.class"
                  >
                    {{ transcriptionStatusBadge.text }}
                  </span>
                </div>
                <p class="text-gray-400 text-xs mt-0.5">
                  {{ $t("settings.transcription.description") }}
                </p>
              </div>
            </div>

            <div v-if="!isSupported" class="text-xs text-red-400 max-w-xs text-right">
              {{ $t("settings.transcription.macosWarning") }}
            </div>
          </div>

          <!-- Row 2: Contextual Controls -->
          <div
            v-if="isSupported"
            class="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <!-- Not Installed -->
            <template v-if="transcriptionStatus === 'notInstalled'">
              <div class="flex items-center gap-2 flex-1">
                <select
                  v-model="selectedModel"
                  data-testid="transcription-model-select"
                  class="bg-[#14161a] border border-[#2a2d33] text-white text-xs rounded-md px-2 py-1.5 focus:outline-none focus:border-white/20 w-full max-w-[200px]"
                >
                  <option value="tiny">
                    {{ $t("settings.transcription.modelLabel") }}: Tiny (75MB)
                  </option>
                  <option value="base">
                    {{ $t("settings.transcription.modelLabel") }}: Base (142MB)
                  </option>
                  <option value="small">
                    {{ $t("settings.transcription.modelLabel") }}: Small (466MB)
                  </option>
                </select>
                <div class="text-[10px] text-gray-500">
                  <template v-if="selectedModel === 'tiny'">{{
                    $t("settings.transcription.modelTiny")
                  }}</template>
                  <template v-if="selectedModel === 'base'">{{
                    $t("settings.transcription.modelBase")
                  }}</template>
                  <template v-if="selectedModel === 'small'">{{
                    $t("settings.transcription.modelSmall")
                  }}</template>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                data-testid="transcription-download-btn"
                class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200"
                @click="downloadModel(selectedModel)"
              >
                <Download class="size-4 mr-2" />
                {{ $t("settings.transcription.downloadButton") }}
              </Button>
            </template>

            <!-- Downloading -->
            <template v-else-if="transcriptionStatus === 'downloading'">
              <div class="flex-1 space-y-1.5 w-full">
                <div class="flex justify-between text-[10px] text-gray-400 font-mono">
                  <span
                    >{{ (downloadProgress.downloaded / 1024 / 1024).toFixed(1) }} MB /
                    {{ (downloadProgress.total / 1024 / 1024).toFixed(1) }} MB</span
                  >
                  <span>{{ downloadProgress.percent.toFixed(1) }}%</span>
                </div>
                <div class="h-1.5 w-full bg-[#2a2d33] rounded-full overflow-hidden">
                  <div
                    class="h-full bg-blue-500 transition-all duration-300"
                    :style="{ width: `${downloadProgress.percent}%` }"
                  ></div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled
                class="border-[#2a2d33] bg-transparent text-gray-400 shrink-0"
              >
                <RefreshCw class="size-4 mr-2 animate-spin" />
                {{ $t("settings.transcription.downloadingButton") }}
              </Button>
            </template>

            <!-- Ready / Active -->
            <template v-else>
              <div class="flex items-center gap-2 flex-1">
                <select
                  v-model="captionMode"
                  data-testid="transcription-mode-select"
                  class="bg-[#14161a] border border-[#2a2d33] text-white text-xs rounded-md px-2 py-1.5 focus:outline-none focus:border-white/20 w-full max-w-[200px]"
                >
                  <option value="original">
                    {{ $t("settings.transcription.captionModeOriginal") }}
                  </option>
                  <option value="translate">
                    {{ $t("settings.transcription.captionModeTranslate") }}
                  </option>
                </select>
                <div class="text-[10px] text-gray-500">
                  {{ $t("settings.transcription.captionModeLabel") }}
                </div>
              </div>
              <div class="flex items-center gap-3 shrink-0">
                <span class="text-xs text-gray-400">{{
                  $t("settings.transcription.enableToggle")
                }}</span>
                <Switch v-model="isEnabled" data-testid="transcription-enable-toggle" />
              </div>
            </template>
          </div>
        </div>

        <!-- Help / Tour Section -->
        <div
          class="flex items-center justify-between border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center size-10 rounded-lg bg-[#14161a] border border-[#2a2d33]"
            >
              <HelpCircle class="size-5 text-gray-400" />
            </div>
            <div>
              <p class="text-white text-sm font-medium">
                {{ $t("settings.help.title") }}
              </p>
              <p class="text-gray-400 text-xs">
                {{ $t("settings.help.description") }}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200 active:scale-[0.97]"
            @click="startTour"
          >
            {{ $t("settings.help.showTourButton") }}
          </Button>
        </div>
      </div>

      <DialogFooter class="pt-5 border-t border-[#2a2d33]/50">
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

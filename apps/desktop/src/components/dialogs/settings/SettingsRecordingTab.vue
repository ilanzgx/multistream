<script setup lang="ts">
import { ref, watch } from "vue";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog.vue";
import { usePreferences } from "@/composables/usePreferences";
import { useRecording } from "@/composables/useRecording";
import { isTauri } from "@/composables/useUpdater";
import {
  Video,
  Trash2,
  Download,
  Settings2,
  ChevronsUp,
  Monitor,
  ChevronsDown,
  FolderOpen,
  RotateCcw,
  Clock,
} from "@lucide/vue";

const props = defineProps<{
  open?: boolean;
  isRecordingSupported?: boolean;
}>();

const isRunningInTauri = isTauri();
const { recordingQuality, recordingPath } = usePreferences();

const {
  orphans,
  recoverOrphan,
  dismissOrphan,
  isDependenciesInstalled,
  isDownloadingDependencies,
  downloadDependenciesProgress,
  downloadDependenciesStep,
  checkDependencies,
  installDependencies,
  uninstallDependencies,
  getEnvSize,
  openFolder,
} = useRecording();

const envSize = ref<number>(0);
const showUninstallConfirm = ref(false);

const requestUninstall = () => {
  showUninstallConfirm.value = true;
};

const confirmUninstall = () => {
  uninstallDependencies();
};

const fetchEnvSize = async () => {
  if (isDependenciesInstalled.value) {
    envSize.value = await getEnvSize();
  }
};

watch(isDependenciesInstalled, (installed) => {
  if (installed) {
    fetchEnvSize();
  } else {
    envSize.value = 0;
  }
});

const showDismissConfirm = ref(false);
const pendingDismissId = ref<string | null>(null);

const requestDismiss = (orphanId: string) => {
  pendingDismissId.value = orphanId;
  showDismissConfirm.value = true;
};

const confirmDismiss = () => {
  if (pendingDismissId.value) {
    dismissOrphan(pendingDismissId.value);
    pendingDismissId.value = null;
  }
};

const handleSelectRecordingPath = async () => {
  if (isRunningInTauri) {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        const pathStr = selected.trim();
        if (
          !pathStr.toLowerCase().endsWith("multistream") &&
          !pathStr.toLowerCase().endsWith("multistream/") &&
          !pathStr.toLowerCase().endsWith("multistream\\")
        ) {
          const { join } = await import("@tauri-apps/api/path");
          recordingPath.value = await join(pathStr, "Multistream");
        } else {
          recordingPath.value = pathStr;
        }
      }
    } catch (e) {
      console.error("Failed to open dialog:", e);
    }
  }
};

watch(
  [() => props.open, () => props.isRecordingSupported],
  ([isOpen, supported]) => {
    if (isOpen && isRunningInTauri && supported) {
      checkDependencies().then((installed) => {
        if (installed) fetchEnvSize();
      });
    }
  },
  { immediate: true }
);
</script>

<template>
  <TabsContent
    v-if="isRunningInTauri && isRecordingSupported"
    value="gravacao"
    class="space-y-8 mt-0 outline-none"
  >
    <!-- 1. Enable Recording Section -->
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2 px-1">
        <Video class="size-4 text-gray-400 shrink-0" />
        <div>
          <h3 class="text-white text-sm font-medium">
            {{ $t("settings.recording.enableTitle") }}
          </h3>
          <p class="text-gray-400 text-xs">
            {{ $t("settings.recording.enableDescription") }}
          </p>
          <p v-if="!isRecordingSupported" class="text-[11px] text-amber-400/80 mt-1">
            {{ $t("settings.recording.unavailableOS") }}
          </p>
        </div>
      </div>
      <div class="shrink-0 flex items-center justify-end">
        <template v-if="isDependenciesInstalled">
          <div class="flex items-center gap-3">
            <span class="text-[10px] text-gray-400">
              {{ (envSize / 1024 / 1024).toFixed(1) }} MB
            </span>
            <Button
              size="sm"
              variant="outline"
              class="border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33]"
              :disabled="!isRecordingSupported"
              @click="requestUninstall"
            >
              <Trash2 class="size-4 mr-1.5" />
              {{ $t("settings.recording.uninstallDependencies") }}
            </Button>
          </div>
        </template>
        <Button
          v-else-if="!isDownloadingDependencies"
          size="sm"
          variant="outline"
          class="border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33]"
          :disabled="!isRecordingSupported"
          @click="installDependencies"
        >
          <Download class="size-4 mr-1.5" />
          {{ $t("settings.recording.downloadDependencies") }}
        </Button>
        <div v-else class="flex flex-col items-end gap-1 w-45">
          <div class="flex justify-between w-full text-[9px] text-gray-400">
            <span class="truncate max-w-35">{{ downloadDependenciesStep }}</span>
            <span>{{ downloadDependenciesProgress }}%</span>
          </div>
          <div class="h-1.5 w-full bg-[#2a2d33] rounded-full overflow-hidden">
            <div
              class="h-full bg-blue-500 transition-all duration-300"
              :style="{ width: `${downloadDependenciesProgress}%` }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. Stream Quality Section -->
    <div
      class="space-y-2"
      :class="{
        'opacity-50 pointer-events-none': !isDependenciesInstalled,
      }"
    >
      <div class="flex items-center gap-2 px-1">
        <Settings2 class="size-4 text-gray-400 shrink-0" />
        <div>
          <h3 class="text-white text-sm font-medium">
            {{ $t("settings.recording.qualityTitle") }}
          </h3>
          <p class="text-gray-400 text-xs">
            {{ $t("settings.recording.qualityDescription") }}
          </p>
        </div>
      </div>
      <div class="bg-[#14161a] border border-[#2a2d33]/60 p-1.5 rounded-xl">
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1 w-full">
          <button
            v-for="quality in [
              { id: 'best', label: $t('settings.recording.qualityBest'), icon: ChevronsUp },
              { id: '1080p', label: $t('settings.recording.quality1080p'), icon: Monitor },
              { id: '720p', label: $t('settings.recording.quality720p'), icon: Monitor },
              { id: '480p', label: $t('settings.recording.quality480p'), icon: Monitor },
              {
                id: 'worst',
                label: $t('settings.recording.qualityWorst'),
                icon: ChevronsDown,
              },
            ]"
            :key="quality.id"
            class="flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-md transition-all duration-150 cursor-pointer min-w-0"
            :class="
              recordingQuality === quality.id
                ? 'bg-white text-black shadow-sm font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            "
            @click="recordingQuality = quality.id"
          >
            <component
              :is="quality.icon"
              class="size-3.5 shrink-0"
              :class="recordingQuality === quality.id ? 'text-black' : 'text-gray-500'"
            />
            <span class="truncate text-[11px] font-medium">{{ quality.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 3. Save Location Section -->
    <div
      class="space-y-2"
      :class="{
        'opacity-50 pointer-events-none': !isDependenciesInstalled,
      }"
    >
      <div class="flex items-center gap-2 px-1">
        <FolderOpen class="size-4 text-gray-400 shrink-0" />
        <div>
          <h3 class="text-white text-sm font-medium">
            {{ $t("settings.recording.pathTitle") }}
          </h3>
          <p class="text-gray-400 text-xs">
            {{ $t("settings.recording.pathDescription") }}
          </p>
        </div>
      </div>
      <div
        class="border border-[#2a2d33]/60 bg-[#14161a] p-3 rounded-xl flex items-center justify-between gap-3"
      >
        <div
          class="flex items-center gap-2 text-xs text-gray-300 truncate bg-[#1e2127] border border-[#2a2d33] px-3 py-1.5 rounded-lg flex-1 min-w-0"
        >
          <span class="truncate">{{ recordingPath || $t("settings.recording.defaultPath") }}</span>
        </div>
        <div class="flex shrink-0 gap-1.5 items-center">
          <Button
            variant="outline"
            size="sm"
            class="border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] text-xs h-8"
            @click="handleSelectRecordingPath"
          >
            {{ $t("settings.recording.selectFolder") }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="border-[#2a2d33] bg-[#1e2127] text-gray-400 hover:text-white hover:bg-[#2a2d33] p-0 size-8 shrink-0"
            :title="$t('settings.recording.openFolder')"
            @click="openFolder('')"
          >
            <FolderOpen class="size-3.5" />
          </Button>
          <Button
            v-if="recordingPath"
            variant="outline"
            size="sm"
            class="border-[#2a2d33] bg-[#1e2127] text-gray-400 hover:text-white hover:bg-[#2a2d33] p-0 size-8 shrink-0"
            :title="$t('settings.recording.resetFolder')"
            @click="recordingPath = ''"
          >
            <RotateCcw class="size-3.5" />
          </Button>
        </div>
      </div>
    </div>

    <!-- 4. Incomplete Recordings Section -->
    <div v-if="orphans.length > 0" class="space-y-2">
      <div class="flex items-center gap-2 px-1">
        <Clock class="size-4 text-amber-400 shrink-0" />
        <div>
          <h3 class="text-white text-sm font-medium">
            {{ $t("settings.recording.orphanTitle") }}
          </h3>
          <p class="text-gray-400 text-xs">
            {{ $t("settings.recording.orphanDescription") }}
          </p>
        </div>
      </div>
      <div class="space-y-2">
        <div
          v-for="orphan in orphans"
          :key="orphan.id"
          class="border border-[#2a2d33]/60 bg-[#14161a] p-3 rounded-xl flex items-center justify-between gap-3"
        >
          <div class="min-w-0">
            <p class="text-sm text-white font-medium truncate">
              {{ orphan.channel }}
            </p>
            <p class="text-xs text-gray-400 truncate">
              {{ orphan.filename }}
            </p>
          </div>
          <div class="flex gap-2 shrink-0">
            <Button
              size="sm"
              class="bg-white text-black hover:bg-gray-200 text-xs h-7"
              @click="recoverOrphan(orphan.id)"
            >
              {{ $t("settings.recording.orphanConvert") }}
            </Button>
            <Button
              size="sm"
              variant="outline"
              class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 text-xs h-7"
              @click="requestDismiss(orphan.id)"
            >
              {{ $t("settings.recording.orphanDismiss") }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </TabsContent>

  <ConfirmDialog
    :open="showDismissConfirm"
    :title="$t('confirm.deleteOrphan.title')"
    :description="$t('confirm.deleteOrphan.description')"
    :confirm-text="$t('confirm.deleteOrphan.confirm')"
    :cancel-text="$t('common.close')"
    variant="destructive"
    @update:open="showDismissConfirm = $event"
    @confirm="confirmDismiss"
  />

  <ConfirmDialog
    :open="showUninstallConfirm"
    :title="$t('settings.recording.uninstallConfirmTitle')"
    :description="$t('settings.recording.uninstallConfirmDescription')"
    :confirm-text="$t('settings.recording.uninstallConfirmButton')"
    :cancel-text="$t('common.close')"
    variant="destructive"
    @update:open="showUninstallConfirm = $event"
    @confirm="confirmUninstall"
  />
</template>

import { ref, watch, onUnmounted } from "vue";
import { createSharedComposable, useStorage } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./useUpdater";
import { toast } from "vue-sonner";
import { i18n } from "../i18n";

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
}

export interface TranscriptionLine {
  text: string;
  timestamp: number;
}

const lines = ref<TranscriptionLine[]>([]);
const transcriptHistory = ref<TranscriptionLine[]>([]);
let listenerRegistered = false;

const _useTranscription = () => {
  // State
  const isSupported = ref(true); // For future macOS BlackHole check, true for Windows
  const installedModels = ref<string[]>([]);
  const isDownloading = ref(false);
  const downloadingModel = ref<string | null>(null);
  const downloadProgress = ref<DownloadProgress>({ downloaded: 0, total: 0, percent: 0 });
  const isActive = ref(false);

  // Persistent Settings
  const selectedModel = useStorage<string>("transcription.model", "base");
  const captionMode = useStorage<"original" | "translate">("transcription.captionMode", "original");

  // Session State
  const isEnabled = ref(false);

  let unlistenProgress: UnlistenFn | null = null;

  // Refresh status from backend
  const updateStatus = async () => {
    if (!isTauri()) return;
    try {
      const status: { installed_models: string[]; active: boolean } = await invoke(
        "get_transcription_status"
      );
      installedModels.value = status.installed_models;
      isActive.value = status.active;

      // If enabled but not active (e.g. app restarted), and model is installed, start it
      if (
        isEnabled.value &&
        !isActive.value &&
        installedModels.value.includes(selectedModel.value)
      ) {
        await startTranscription();
      } else if (!isEnabled.value && isActive.value) {
        // Should not happen normally, but ensure sync
        await stopTranscription();
      }
    } catch (e) {
      console.error("Failed to get transcription status:", e);
    }
  };

  const downloadModel = async (modelName: string) => {
    if (!isTauri() || isDownloading.value) return;

    isDownloading.value = true;
    downloadingModel.value = modelName;
    downloadProgress.value = { downloaded: 0, total: 0, percent: 0 };

    try {
      unlistenProgress = await listen<DownloadProgress>(
        "transcription:download-progress",
        (event) => {
          downloadProgress.value = event.payload;
        }
      );

      await invoke("download_whisper_model", { modelName });
      await updateStatus();

      // Auto-select the newly downloaded model if none was installed before
      selectedModel.value = modelName;
    } catch (e) {
      console.error("Failed to download model:", e);
      throw e;
    } finally {
      isDownloading.value = false;
      downloadingModel.value = null;
      if (unlistenProgress) {
        unlistenProgress();
        unlistenProgress = null;
      }
    }
  };

  const startTranscription = async () => {
    if (!isTauri() || !installedModels.value.includes(selectedModel.value)) return;

    try {
      const translate = captionMode.value === "translate";
      await invoke("start_transcription", {
        modelName: selectedModel.value,
        translate,
      });
      isActive.value = true;
    } catch (e) {
      console.error("Failed to start transcription:", e);
      isEnabled.value = false; // Reset if failed
    }
  };

  const stopTranscription = async () => {
    if (!isTauri()) return;

    try {
      await invoke("stop_transcription");
      isActive.value = false;
      lines.value = []; // Clear lines when stopped
    } catch (e) {
      console.error("Failed to stop transcription:", e);
    }
  };

  const deleteModel = async (modelName: string) => {
    if (!isTauri() || isDownloading.value) return;

    try {
      if (isActive.value && selectedModel.value === modelName) {
        await stopTranscription();
      }

      await invoke("delete_whisper_model", { modelName });
      await updateStatus();

      // Fallback logic
      if (selectedModel.value === modelName) {
        if (installedModels.value.length > 0) {
          selectedModel.value = installedModels.value[0];
          // If transcription was globally enabled, restart it with the fallback model
          if (isEnabled.value) {
            await startTranscription();
          }
        } else {
          // No models left
          isEnabled.value = false;
        }
      }
    } catch (e) {
      console.error("Failed to delete model:", e);
      throw e;
    }
  };

  // Watchers
  watch(
    [isEnabled, captionMode, selectedModel],
    async ([enabled, _mode, _model], [oldEnabled, oldMode, oldModel]) => {
      // Only react if we're actually toggling, changing mode while enabled, or changing model while enabled
      if (enabled) {
        if (!installedModels.value.includes(selectedModel.value)) {
          // Cannot enable if model is not installed
          isEnabled.value = false;
          return;
        }
        // If it was just toggled on, or if mode/model changed while it was already on
        if (
          !oldEnabled ||
          (oldEnabled && (oldMode !== captionMode.value || oldModel !== selectedModel.value))
        ) {
          await startTranscription();

          const t = i18n.global.t;
          const modelNameText =
            selectedModel.value.charAt(0).toUpperCase() + selectedModel.value.slice(1);
          const modeText =
            captionMode.value === "translate"
              ? t("settings.transcription.captionModeTranslate")
              : t("settings.transcription.captionModeOriginal");

          toast.success(t("settings.transcription.startedTitle"), {
            description: `${t("settings.transcription.startedModel", { model: modelNameText })}\n${t("settings.transcription.startedMode", { mode: modeText })}`,
          });
        }
      } else if (!enabled && oldEnabled) {
        await stopTranscription();
        const t = i18n.global.t;
        toast.info(t("settings.transcription.stoppedTitle"));
      }
    }
  );

  // Initialization
  if (isTauri()) {
    if (!listenerRegistered) {
      listenerRegistered = true;
      listen<TranscriptionLine>("transcription:text", (event) => {
        const newLines = [...lines.value, event.payload];
        if (newLines.length > 8) {
          newLines.shift(); // Keep max 8 entries for overlay
        }
        lines.value = newLines;

        const newHistory = [...transcriptHistory.value, event.payload];
        if (newHistory.length > 1000) {
          newHistory.shift(); // Keep max 1000 entries for global view
        }
        transcriptHistory.value = newHistory;
      }).catch(console.error);
    }
    updateStatus();
  }

  // Cleanup on unmount (if not used as shared, but shared composables don't typically unmount)
  onUnmounted(() => {
    if (unlistenProgress) unlistenProgress();
  });

  const clearTranscriptHistory = () => {
    transcriptHistory.value = [];
  };

  return {
    isSupported,
    installedModels,
    selectedModel,
    isEnabled,
    captionMode,
    isDownloading,
    downloadingModel,
    downloadProgress,
    isActive,
    lines,
    transcriptHistory,
    downloadModel,
    deleteModel,
    startTranscription,
    stopTranscription,
    updateStatus,
    clearTranscriptHistory,
  };
};

export const useTranscription = createSharedComposable(_useTranscription);

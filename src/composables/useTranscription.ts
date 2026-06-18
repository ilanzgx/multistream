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
  const isSupported = ref(false); // Validated via backend during initialization
  const installedModels = ref<string[]>([]);
  const isDownloading = ref(false);
  const downloadingModel = ref<string | null>(null);
  const downloadProgress = ref<DownloadProgress>({ downloaded: 0, total: 0, percent: 0 });
  const isActive = ref(false);
  const status = ref<"active" | "processing" | "error" | "inactive">("inactive");
  const lastCaptionTime = ref<number | null>(null);

  // Persistent Settings
  const selectedModel = useStorage<string>("transcription.model", "base");
  const captionMode = useStorage<"original" | "translate">("transcription.captionMode", "original");

  // Session State
  const isEnabled = ref(false);

  let unlistenProgress: UnlistenFn | null = null;

  // Refresh status from backend
  const updateStatus = async () => {
    if (!isTauri() || !isSupported.value) return;
    try {
      const backendStatus: { installed_models: string[]; active: boolean } = await invoke(
        "get_transcription_status"
      );
      installedModels.value = backendStatus.installed_models;
      isActive.value = backendStatus.active;

      if (backendStatus.active && status.value === "inactive") {
        status.value = "active";
      } else if (!backendStatus.active) {
        status.value = "inactive";
      }

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

      // Auto-select the newly downloaded model if none was installed before or the current selection is invalid
      if (!selectedModel.value || !installedModels.value.includes(selectedModel.value)) {
        selectedModel.value = modelName;
      }
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

  const cancelDownload = async () => {
    if (!isTauri() || !isDownloading.value) return;
    try {
      await invoke("cancel_whisper_download");
    } catch (e) {
      console.error("Failed to cancel download:", e);
    }
  };

  const startTranscription = async (): Promise<boolean> => {
    if (!isTauri() || !installedModels.value.includes(selectedModel.value)) return false;

    try {
      const translate = captionMode.value === "translate";
      await invoke("start_transcription", {
        modelName: selectedModel.value,
        translate,
      });
      isActive.value = true;
      status.value = "active";
      return true;
    } catch (e) {
      console.error("Failed to start transcription:", e);
      isEnabled.value = false; // Reset if failed
      return false;
    }
  };

  const stopTranscription = async () => {
    if (!isTauri()) return;

    try {
      await invoke("stop_transcription");
      isActive.value = false;
      status.value = "inactive";
      lastCaptionTime.value = null;
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
          const started = await startTranscription();
          if (!started) return;

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
    invoke<boolean>("is_transcription_supported")
      .then((supported) => {
        isSupported.value = supported;
        if (supported) {
          if (!listenerRegistered) {
            listenerRegistered = true;
            listen<TranscriptionLine>("transcription:text", (event) => {
              const newLines = [...lines.value, event.payload];
              if (newLines.length > 6) {
                newLines.shift(); // Keep max 6 entries for overlay
              }
              lines.value = newLines;

              const newHistory = [...transcriptHistory.value, event.payload];
              if (newHistory.length > 1000) {
                newHistory.shift(); // Keep max 1000 entries for global view
              }
              transcriptHistory.value = newHistory;
              lastCaptionTime.value = Date.now();
            }).catch(console.error);

            listen<string>("transcription:status", (event) => {
              if (isActive.value) {
                status.value = event.payload as "active" | "processing" | "error";
              }
            }).catch(console.error);
          }
          updateStatus();
        }
      })
      .catch(console.error);
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
    status,
    lastCaptionTime,
    lines,
    transcriptHistory,
    downloadModel,
    cancelDownload,
    deleteModel,
    startTranscription,
    stopTranscription,
    updateStatus,
    clearTranscriptHistory,
  };
};

export const useTranscription = createSharedComposable(_useTranscription);

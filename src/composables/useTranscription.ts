import { ref, watch, onUnmounted } from "vue";
import { createSharedComposable, useStorage } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./useUpdater";

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
}

export interface TranscriptionLine {
  text: string;
  timestamp: number;
}

const _useTranscription = () => {
  // State
  const isSupported = ref(true); // For future macOS BlackHole check, true for Windows
  const installedModels = ref<string[]>([]);
  const isDownloading = ref(false);
  const downloadProgress = ref<DownloadProgress>({ downloaded: 0, total: 0, percent: 0 });
  const isActive = ref(false);
  const lines = ref<TranscriptionLine[]>([]);

  // Persistent Settings
  const selectedModel = useStorage<string>("transcription.model", "base");
  const isEnabled = useStorage<boolean>("transcription.enabled", false);
  const captionMode = useStorage<"original" | "translate">("transcription.captionMode", "original");

  let unlistenProgress: UnlistenFn | null = null;
  let unlistenText: UnlistenFn | null = null;

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
      if (unlistenProgress) {
        unlistenProgress();
        unlistenProgress = null;
      }
    }
  };

  const startTranscription = async () => {
    if (!isTauri() || !installedModels.value.includes(selectedModel.value)) return;

    try {
      if (!unlistenText) {
        unlistenText = await listen<TranscriptionLine>("transcription:text", (event) => {
          lines.value.push(event.payload);
          if (lines.value.length > 8) {
            lines.value.shift(); // Keep max 8 entries
          }
        });
      }

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

      if (unlistenText) {
        unlistenText();
        unlistenText = null;
      }
    } catch (e) {
      console.error("Failed to stop transcription:", e);
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
        }
      } else if (!enabled && oldEnabled) {
        await stopTranscription();
      }
    }
  );

  // Initialization
  if (isTauri()) {
    updateStatus();
  }

  // Cleanup on unmount (if not used as shared, but shared composables don't typically unmount)
  onUnmounted(() => {
    if (unlistenProgress) unlistenProgress();
    if (unlistenText) unlistenText();
  });

  return {
    isSupported,
    installedModels,
    selectedModel,
    isEnabled,
    captionMode,
    isDownloading,
    downloadProgress,
    isActive,
    lines,
    downloadModel,
    startTranscription,
    stopTranscription,
    updateStatus,
  };
};

export const useTranscription = createSharedComposable(_useTranscription);

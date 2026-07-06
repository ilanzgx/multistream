import { createSharedComposable } from "@vueuse/core";
import { reactive, ref, onScopeDispose } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import type { Stream } from "./useStreams";

export interface RecordingState {
  streamId: string;
  channel: string;
  platform: string;
  status: "idle" | "starting" | "recording" | "stopping" | "remuxing" | "error";
  startedAt?: number;
  elapsed: number;
  quality: string;
  error?: string;
}

export interface OrphanRecording {
  id: string;
  channel: string;
  filename: string;
  sizeBytes: number;
}

const recordings = reactive(new Map<string, RecordingState>());
const orphans = ref<OrphanRecording[]>([]);

const isDependenciesInstalled = ref(false);
const isDownloadingDependencies = ref(false);
const downloadDependenciesProgress = ref(0);
const downloadDependenciesStep = ref("");

let tickerHandle: ReturnType<typeof setInterval> | null = null;

function ensureTicker() {
  if (tickerHandle !== null) return;
  tickerHandle = setInterval(() => {
    for (const entry of recordings.values()) {
      if (entry.status === "recording" && entry.startedAt !== undefined) {
        entry.elapsed = Math.floor((Date.now() - entry.startedAt) / 1000);
      }
    }
  }, 1000);
}

function stopTickerIfIdle() {
  const anyRecording = [...recordings.values()].some(
    (e) => e.status === "recording"
  );
  if (!anyRecording && tickerHandle !== null) {
    clearInterval(tickerHandle);
    tickerHandle = null;
  }
}

export function __test_resetState() {
  recordings.clear();
  orphans.value = [];
  if (tickerHandle !== null) {
    clearInterval(tickerHandle);
    tickerHandle = null;
  }
}

const _useRecording = () => {
  const { t } = useI18n();

  const unlisten1 = listen<{ streamId: string; channel: string; platform: string }>(
    "recording:started",
    ({ payload }) => {
      const entry = recordings.get(payload.streamId);
      if (entry) {
        entry.status = "recording";
        entry.startedAt = Date.now();
        entry.elapsed = 0;
      } else {
        recordings.set(payload.streamId, {
          streamId: payload.streamId,
          channel: payload.channel,
          platform: payload.platform,
          status: "recording",
          startedAt: Date.now(),
          elapsed: 0,
          quality: "best",
        });
      }
      ensureTicker();
    }
  );

  const unlisten2 = listen<{ streamId: string }>("recording:stopping", ({ payload }) => {
    const entry = recordings.get(payload.streamId);
    if (entry) entry.status = "stopping";
  });

  const unlisten3 = listen<{ streamId: string }>("recording:remux-started", ({ payload }) => {
    const entry = recordings.get(payload.streamId);
    if (entry) entry.status = "remuxing";
  });

  const unlisten4 = listen<{ streamId: string }>("recording:remux-finished", ({ payload }) => {
    recordings.delete(payload.streamId);
    stopTickerIfIdle();
    toast.success(t("settings.recording.saved"), {
      action: {
        label: t("settings.recording.openFolder"),
        onClick: () => invoke("open_recording_folder", { streamId: payload.streamId }),
      },
    });
  });

  const unlisten5 = listen<{ streamId: string; error: string }>(
    "recording:remux-failed",
    ({ payload }) => {
      const entry = recordings.get(payload.streamId);
      if (entry) recordings.delete(payload.streamId);
      stopTickerIfIdle();
      toast.warning(t("settings.recording.remuxFailed"), {
        action: {
          label: t("settings.recording.openFolder"),
          onClick: () => invoke("open_recording_folder", { streamId: payload.streamId }),
        },
      });
    }
  );

  const unlisten6 = listen<{ streamId: string; channel: string }>(
    "recording:stream-ended",
    ({ payload }) => {
      const entry = recordings.get(payload.streamId);
      if (entry) entry.status = "stopping";
      toast.info(t("settings.recording.streamEnded"));
    }
  );

  const unlisten7 = listen<{ streamId: string; error: string }>(
    "recording:error",
    ({ payload }) => {
      const entry = recordings.get(payload.streamId);
      if (entry) {
        recordings.delete(payload.streamId);
      }
      stopTickerIfIdle();
      toast.error(t("settings.recording.streamError", { error: payload.error }));
    }
  );

  const unlisten8 = listen<{ orphans: OrphanRecording[] }>(
    "recording:orphans-found",
    ({ payload }) => {
      orphans.value = payload.orphans;
      toast.info(t("settings.recording.orphanFound", { count: payload.orphans.length }), {
        duration: Infinity,
      });
    }
  );

  const unlisten9 = listen<{ step: string; progress: number }>(
    "recording-install-progress",
    ({ payload }) => {
      downloadDependenciesStep.value = payload.step;
      downloadDependenciesProgress.value = payload.progress;
    }
  );

  onScopeDispose(async () => {
    (await unlisten1)();
    (await unlisten2)();
    (await unlisten3)();
    (await unlisten4)();
    (await unlisten5)();
    (await unlisten6)();
    (await unlisten7)();
    (await unlisten8)();
    (await unlisten9)();
  });

  const actionLocks = new Set<string>();

  async function startRecording(stream: Stream, quality: string = "best"): Promise<void> {
    if (actionLocks.has(stream.id)) return;
    actionLocks.add(stream.id);
    setTimeout(() => actionLocks.delete(stream.id), 5500);

    if (stream.platform === "custom") {
      toast.error(t("settings.recording.customNotSupported"));
      return;
    }

    recordings.set(stream.id, {
      streamId: stream.id,
      channel: stream.channel,
      platform: stream.platform,
      status: "starting",
      elapsed: 0,
      quality,
    });
    const tKey = `settings.recording.quality${quality.charAt(0).toUpperCase() + quality.slice(1)}`;
    const qualityLabel = t(tKey) !== tKey ? t(tKey) : quality;
    const prefix = t("settings.recording.qualityPrefix");
    const prefixText = prefix !== "settings.recording.qualityPrefix" ? prefix : "Quality: ";
    toast.info(`${t("settings.recording.starting")} ${prefixText}${qualityLabel}`);
    try {
      await invoke("start_recording", {
        streamId: stream.id,
        channel: stream.channel,
        platform: stream.platform,
        quality,
      });
    } catch (e) {
      recordings.delete(stream.id);
      toast.error(String(e));
    }
  }

  async function stopRecording(streamId: string): Promise<void> {
    if (actionLocks.has(streamId)) return;
    actionLocks.add(streamId);
    setTimeout(() => actionLocks.delete(streamId), 5500);

    toast.info(t("settings.recording.stopping"));
    try {
      await invoke("stop_recording", { streamId });
    } catch (e) {
      toast.error(String(e));
    }
  }

  function isRecording(streamId: string): boolean {
    const entry = recordings.get(streamId);
    return entry !== undefined && (entry.status === "recording" || entry.status === "starting");
  }

  function getState(streamId: string): RecordingState | undefined {
    return recordings.get(streamId);
  }

  async function openFolder(streamId: string): Promise<void> {
    await invoke("open_recording_folder", { streamId });
  }

  async function recoverOrphan(orphanId: string): Promise<void> {
    toast.info(t("settings.recording.remuxing"));
    try {
      await invoke("recover_orphan_recording", { orphanId });
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function dismissOrphan(orphanId: string): Promise<void> {
    try {
      await invoke("dismiss_orphan_recording", { orphanId });
      orphans.value = orphans.value.filter((o) => o.id !== orphanId);
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function checkDependencies(): Promise<boolean> {
    try {
      isDependenciesInstalled.value = await invoke<boolean>("recording_check_dependencies");
      return isDependenciesInstalled.value;
    } catch (e) {
      console.error("Failed to check recording dependencies:", e);
      return false;
    }
  }

  async function installDependencies(): Promise<void> {
    if (isDownloadingDependencies.value) return;
    isDownloadingDependencies.value = true;
    downloadDependenciesProgress.value = 0;
    downloadDependenciesStep.value = "Starting download...";
    
    try {
      await invoke("recording_install_dependencies");
      isDependenciesInstalled.value = true;
      toast.success(t("settings.recording.installSuccess", "Dependencies installed successfully"));
    } catch (e) {
      toast.error(t("settings.recording.installError", { error: String(e) }));
    } finally {
      isDownloadingDependencies.value = false;
    }
  }

  return {
    recordings,
    orphans,
    isDependenciesInstalled,
    isDownloadingDependencies,
    downloadDependenciesProgress,
    downloadDependenciesStep,
    startRecording,
    stopRecording,
    isRecording,
    getState,
    openFolder,
    recoverOrphan,
    dismissOrphan,
    checkDependencies,
    installDependencies,
  };
};

export const useRecording = createSharedComposable(_useRecording);

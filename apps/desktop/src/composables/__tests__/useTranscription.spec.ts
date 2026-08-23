import { effectScope, EffectScope } from "vue";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTranscription, __test_resetTranscriptionState } from "../useTranscription";

// Mock Tauri invoke and listen
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

// Mock useUpdater for isTauri = true
vi.mock("@/composables/useUpdater", () => ({
  isTauri: () => true,
  useUpdater: () => ({ checkForUpdates: vi.fn(), isChecking: false }),
}));

vi.mock("@/composables/useToast", () => ({
  toast: { success: vi.fn(), info: vi.fn() },
}));

vi.mock("vue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue")>();
  return {
    ...actual,
    onUnmounted: vi.fn(),
  };
});

vi.mock("../i18n", () => ({
  i18n: { global: { t: (key: string) => key } },
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

describe("useTranscription composable unit tests", () => {
  let scope: EffectScope;
  beforeEach(() => {
    scope = effectScope();
    // Arrange
    vi.clearAllMocks();
    localStorage.clear();
    __test_resetTranscriptionState();

    // Default invoke mock
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "is_transcription_supported") return Promise.resolve(true);
      if (cmd === "get_transcription_status")
        return Promise.resolve({
          installed_models: ["base", "small"],
          active: false,
        });
      return Promise.resolve();
    });

    // Default listen mock returning an unlisten function
    (listen as any).mockResolvedValue(vi.fn());
  });

  afterEach(() => {
    scope?.stop();
    vi.restoreAllMocks();
  });

  it("should initialize status properly on tauri", async () => {
    // Arrange
    const { installedModels, isActive, updateStatus, isSupported } = scope.run(() =>
      useTranscription()
    )!;
    isSupported.value = true;
    await new Promise((r) => setTimeout(r, 0)); // wait for initialization

    // Act
    await updateStatus();

    // Assert
    expect(invoke).toHaveBeenCalledWith("get_transcription_status");
    expect(installedModels.value).toEqual(["base", "small"]);
    expect(isActive.value).toBe(false);
  });

  it("should download model and update status", async () => {
    // Arrange
    const { downloadModel, isDownloading, installedModels, isSupported } = scope.run(() =>
      useTranscription()
    )!;
    isSupported.value = true;
    await new Promise((r) => setTimeout(r, 0)); // wait for initialization

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "is_transcription_supported") return Promise.resolve(true);
      if (cmd === "download_whisper_model") return Promise.resolve();
      if (cmd === "get_transcription_status")
        return Promise.resolve({
          installed_models: ["base", "small", "tiny"],
          active: false,
        });
      return Promise.resolve();
    });

    // Act
    const promise = downloadModel("tiny");

    // Assert (mid-flight)
    expect(isDownloading.value).toBe(true);
    expect(listen).toHaveBeenCalledWith("transcription:download-progress", expect.any(Function));

    // Act (finish)
    await promise;

    // Assert
    expect(invoke).toHaveBeenCalledWith("download_whisper_model", { modelName: "tiny" });
    expect(isDownloading.value).toBe(false);
    expect(installedModels.value).toContain("tiny");
  });

  it("should start transcription and listen to text events", async () => {
    // Arrange
    const { startTranscription, isActive, selectedModel, updateStatus, isSupported } = scope.run(
      () => useTranscription()
    )!;
    isSupported.value = true;
    await new Promise((r) => setTimeout(r, 0)); // wait for initialization
    await updateStatus(); // Load installed models
    selectedModel.value = "base";

    // Act
    await startTranscription();

    // Assert
    expect(invoke).toHaveBeenCalledWith("start_transcription", {
      modelName: "base",
      translate: false,
      chunkDuration: 10,
    });
    expect(isActive.value).toBe(true);
  });

  it("should stop transcription and clear lines but not transcriptHistory", async () => {
    // Arrange
    const { stopTranscription, isActive, lines, transcriptHistory, isSupported } = scope.run(() =>
      useTranscription()
    )!;
    isSupported.value = true;
    await new Promise((r) => setTimeout(r, 0)); // wait for initialization
    isActive.value = true;
    lines.value = [{ text: "Hello", timestamp: 123 }];
    transcriptHistory.value = [{ text: "Hello", timestamp: 123 }];

    // Act
    await stopTranscription();

    // Assert
    expect(invoke).toHaveBeenCalledWith("stop_transcription");
    expect(isActive.value).toBe(false);
    expect(lines.value).toEqual([]);
    expect(transcriptHistory.value).toEqual([{ text: "Hello", timestamp: 123 }]); // Keeps history
  });

  it("should clear transcriptHistory", async () => {
    // Arrange
    const { clearTranscriptHistory, transcriptHistory } = scope.run(() => useTranscription())!;
    await new Promise((r) => setTimeout(r, 0)); // wait for initialization
    transcriptHistory.value = [{ text: "Hello", timestamp: 123 }];

    // Act
    clearTranscriptHistory();

    // Assert
    expect(transcriptHistory.value).toEqual([]);
  });

  it("should default chunkDuration to 10", async () => {
    // Arrange
    const { chunkDuration } = scope.run(() => useTranscription())!;
    await new Promise((r) => setTimeout(r, 0));

    // Act / Assert
    expect(chunkDuration.value).toBe(10);
  });

  it("should default showOverlay to true", async () => {
    // Arrange
    const { showOverlay } = scope.run(() => useTranscription())!;
    await new Promise((r) => setTimeout(r, 0));

    // Act / Assert
    expect(showOverlay.value).toBe(true);
  });

  it("should snap setChunkDuration to nearest valid step", async () => {
    // Arrange
    const { setChunkDuration, chunkDuration } = scope.run(() => useTranscription())!;
    await new Promise((r) => setTimeout(r, 0));

    // Act — value 7 should snap up to 10
    await setChunkDuration(7);

    // Assert
    expect(chunkDuration.value).toBe(10);
    expect(invoke).toHaveBeenCalledWith("set_chunk_duration", { seconds: 10 });
  });

  it("should call set_chunk_duration with exact step value", async () => {
    // Arrange
    const { setChunkDuration } = scope.run(() => useTranscription())!;
    await new Promise((r) => setTimeout(r, 0));

    // Act
    await setChunkDuration(5);

    // Assert
    expect(invoke).toHaveBeenCalledWith("set_chunk_duration", { seconds: 5 });
  });

  it("should cancel download", async () => {
    // Arrange
    const { cancelDownload, isDownloading, isSupported } = scope.run(() => useTranscription())!;
    isSupported.value = true;
    await new Promise((r) => setTimeout(r, 0));
    isDownloading.value = true;

    // Act
    await cancelDownload();

    // Assert
    expect(invoke).toHaveBeenCalledWith("cancel_whisper_download");
  });

  it("should delete model and update status", async () => {
    // Arrange
    const { deleteModel, installedModels, isSupported, isActive, selectedModel } = scope.run(() =>
      useTranscription()
    )!;
    isSupported.value = true;
    await new Promise((r) => setTimeout(r, 0));
    installedModels.value = ["base", "small"];
    selectedModel.value = "base";
    isActive.value = false;

    // Act
    await deleteModel("small");

    // Assert
    expect(invoke).toHaveBeenCalledWith("delete_whisper_model", { modelName: "small" });
    expect(invoke).toHaveBeenCalledWith("get_transcription_status");
  });

  it("should stop transcription if deleting the active model", async () => {
    // Arrange
    const { deleteModel, installedModels, isSupported, isActive, selectedModel } = scope.run(() =>
      useTranscription()
    )!;
    isSupported.value = true;
    await new Promise((r) => setTimeout(r, 0));
    installedModels.value = ["base", "small"];
    selectedModel.value = "base";
    isActive.value = true;

    // Act
    await deleteModel("base");

    // Assert
    expect(invoke).toHaveBeenCalledWith("stop_transcription");
    expect(invoke).toHaveBeenCalledWith("delete_whisper_model", { modelName: "base" });
  });

  it("should restart transcription if captionMode changes while enabled", async () => {
    // Arrange
    const { isEnabled, captionMode, selectedModel, installedModels, isSupported } = scope.run(() =>
      useTranscription()
    )!;
    isSupported.value = true;
    await new Promise((r) => setTimeout(r, 0));
    installedModels.value = ["base"];
    selectedModel.value = "base";
    isEnabled.value = true; // Initially enabled
    await new Promise((r) => setTimeout(r, 0));

    // Act
    captionMode.value = "translate";
    await new Promise((r) => setTimeout(r, 0)); // wait for watcher

    // Assert
    expect(invoke).toHaveBeenCalledWith("start_transcription", {
      modelName: "base",
      translate: true,
      chunkDuration: 10,
    });
  });

  it("should maintain global state across composable unmounts (Closure Isolation)", async () => {
    // Arrange: Mount component, trigger initial fetch, unmount component.
    const firstScope = effectScope();
    const { isSupported: isSupportedFirst } = firstScope.run(() => useTranscription())!;
    isSupportedFirst.value = true;
    await new Promise((r) => setTimeout(r, 0)); // wait for initialization
    firstScope.stop(); // Unmount

    // Act: Re-mount component, simulate a status event.
    const secondScope = effectScope();
    const { isActive, status } = secondScope.run(() => useTranscription())!;
    await new Promise((r) => setTimeout(r, 0));

    // Simulate Tauri listen callback for transcription:status
    const listenMock = listen as ReturnType<typeof vi.fn>;
    const statusCallback = listenMock.mock.calls.find((c) => c[0] === "transcription:status")?.[1];

    // Must be active to receive status updates according to logic
    isActive.value = true;
    if (statusCallback) {
      statusCallback({ payload: "processing" });
    }

    // Assert: The newly mounted instance correctly reflects the updated status.
    expect(status.value).toBe("processing");
    secondScope.stop();
  });

  it("should persist background download state when composable is unmounted", async () => {
    // Arrange
    const firstScope = effectScope();
    const { downloadModel, isSupported } = firstScope.run(() => useTranscription())!;
    isSupported.value = true;
    await new Promise((r) => setTimeout(r, 0));

    // Mock download to be pending so we can test state
    let resolveDownload: any;
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "is_transcription_supported") return Promise.resolve(true);
      if (cmd === "download_whisper_model")
        return new Promise((r) => {
          resolveDownload = r;
        });
      if (cmd === "get_transcription_status")
        return Promise.resolve({ installed_models: [], active: false });
      return Promise.resolve();
    });

    // Act: Start download, verify true, then unmount
    downloadModel("tiny");
    await new Promise((r) => setTimeout(r, 0));
    firstScope.stop(); // Simulates closing settings dialog

    // Act: Re-mount and check if it still knows it's downloading
    const secondScope = effectScope();
    const { isDownloading, downloadProgress } = secondScope.run(() => useTranscription())!;

    // Simulate Tauri download progress event
    const listenMock = listen as ReturnType<typeof vi.fn>;
    const progressCallback = listenMock.mock.calls.find(
      (c) => c[0] === "transcription:download-progress"
    )?.[1];
    if (progressCallback) {
      progressCallback({ payload: { downloaded: 50, total: 100, percent: 50 } });
    }

    // Assert: It should still be downloading and reflect progress
    expect(isDownloading.value).toBe(true);
    expect(downloadProgress.value.percent).toBe(50);

    resolveDownload(); // Clean up
    secondScope.stop();
  });

  it("should handle watcher race condition when rapidly toggling isEnabled", async () => {
    // Arrange
    const { isEnabled, installedModels, selectedModel, isSupported } = scope.run(() =>
      useTranscription()
    )!;
    isSupported.value = true;
    await new Promise((r) => setTimeout(r, 0));
    installedModels.value = ["base"];
    selectedModel.value = "base";

    let resolveStart: any;
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "start_transcription")
        return new Promise((r) => {
          resolveStart = r;
        });
      return Promise.resolve();
    });

    // Act: Toggle on, then immediately toggle off before start resolves
    isEnabled.value = true;
    await new Promise((r) => setTimeout(r, 0)); // let watcher trigger
    isEnabled.value = false;
    await new Promise((r) => setTimeout(r, 0)); // let watcher trigger again

    // Resolve the start transcription now
    resolveStart();
    await new Promise((r) => setTimeout(r, 0)); // let async/await resume

    // Assert: stop_transcription should have been called to fix the desync
    expect(invoke).toHaveBeenCalledWith("stop_transcription");
  });
});

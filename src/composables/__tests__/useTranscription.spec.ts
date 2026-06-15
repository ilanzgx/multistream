import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTranscription } from "../useTranscription";

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

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

describe("useTranscription composable unit tests", () => {
  beforeEach(() => {
    // Arrange
    vi.clearAllMocks();
    localStorage.clear();

    // Default get_transcription_status mock
    (invoke as any).mockResolvedValue({
      installed_models: ["base", "small"],
      active: false,
    });

    // Default listen mock returning an unlisten function
    (listen as any).mockResolvedValue(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should initialize status properly on tauri", async () => {
    // Arrange
    const { installedModels, isActive, updateStatus } = useTranscription();

    // Act
    await updateStatus();

    // Assert
    expect(invoke).toHaveBeenCalledWith("get_transcription_status");
    expect(installedModels.value).toEqual(["base", "small"]);
    expect(isActive.value).toBe(false);
  });

  it("should download model and update status", async () => {
    // Arrange
    const { downloadModel, isDownloading, installedModels } = useTranscription();

    (invoke as any).mockImplementation((cmd: string) => {
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
    const { startTranscription, isActive, selectedModel, updateStatus } = useTranscription();
    await updateStatus(); // Load installed models
    selectedModel.value = "base";

    // Act
    await startTranscription();

    // Assert
    expect(invoke).toHaveBeenCalledWith("start_transcription", {
      modelName: "base",
      translate: false,
    });
    expect(isActive.value).toBe(true);
  });

  it("should stop transcription and clear lines", async () => {
    // Arrange
    const { stopTranscription, isActive, lines } = useTranscription();
    isActive.value = true;
    lines.value = [{ text: "Hello", timestamp: 123 }];

    // Act
    await stopTranscription();

    // Assert
    expect(invoke).toHaveBeenCalledWith("stop_transcription");
    expect(isActive.value).toBe(false);
    expect(lines.value).toEqual([]);
  });
});

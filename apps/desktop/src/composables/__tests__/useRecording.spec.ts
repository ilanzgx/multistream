import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useRecording, __test_resetState } from "../useRecording";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "vue-sonner";
import type { Stream } from "../useStreams";
import { nextTick, effectScope } from "vue";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}));

vi.mock("vue-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, _params?: any) => key,
  }),
}));

describe("useRecording", () => {
  beforeEach(() => {
    // Arrange
    __test_resetState();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mockStream: Stream = {
    id: "stream1",
    channel: "testchannel",
    platform: "twitch",
  };

  const mockCustomStream: Stream = {
    id: "stream2",
    channel: "customchannel",
    platform: "custom",
  };

  it("should prevent recording custom streams", async () => {
    // Arrange
    const scope = effectScope();
    const { startRecording, isRecording } = scope.run(() => useRecording())!;

    // Act
    await startRecording(mockCustomStream);

    // Assert
    expect(isRecording(mockCustomStream.id)).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("settings.recording.customNotSupported");
    expect(invoke).not.toHaveBeenCalled();
    scope.stop();
  });

  it("should optimistic start recording and call invoke", async () => {
    // Arrange
    const scope = effectScope();
    const { startRecording, isRecording, getState } = scope.run(() => useRecording())!;

    // Act
    await startRecording(mockStream, "1080p");

    // Assert
    expect(isRecording(mockStream.id)).toBe(true);
    expect(getState(mockStream.id)?.status).toBe("starting");
    expect(getState(mockStream.id)?.quality).toBe("1080p");
    expect(toast.info).toHaveBeenCalledWith("settings.recording.starting Quality: 1080p");
    expect(invoke).toHaveBeenCalledWith("start_recording", {
      streamId: mockStream.id,
      channel: mockStream.channel,
      platform: mockStream.platform,
      quality: "1080p",
      outputDir: null,
    });
    scope.stop();
  });

  it("should revert state if invoke start_recording fails", async () => {
    // Arrange
    const scope = effectScope();
    const { startRecording, isRecording } = scope.run(() => useRecording())!;
    vi.mocked(invoke).mockRejectedValueOnce(new Error("Failed to start"));

    // Act
    await startRecording(mockStream);
    await nextTick(); // Wait for promise rejection

    // Assert
    expect(isRecording(mockStream.id)).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Error: Failed to start");
    scope.stop();
  });

  it("should call invoke when stopRecording is called", async () => {
    // Arrange
    const scope = effectScope();
    const { stopRecording } = scope.run(() => useRecording())!;

    // Act
    await stopRecording(mockStream.id);

    // Assert
    expect(toast.info).toHaveBeenCalledWith("settings.recording.stopping");
    expect(invoke).toHaveBeenCalledWith("stop_recording", { streamId: mockStream.id });
    scope.stop();
  });

  it("should call invoke when openFolder is called", async () => {
    // Arrange
    const scope = effectScope();
    const { openFolder } = scope.run(() => useRecording())!;

    // Act
    await openFolder(mockStream.id);

    // Assert
    expect(invoke).toHaveBeenCalledWith("open_recording_folder", {
      streamId: mockStream.id,
      outputDir: null,
    });
    scope.stop();
  });

  it("should recover orphan recording", async () => {
    // Arrange
    const scope = effectScope();
    const { recoverOrphan } = scope.run(() => useRecording())!;

    // Act
    await recoverOrphan("orphan1");

    // Assert
    expect(toast.info).toHaveBeenCalledWith("settings.recording.remuxing", {
      description: "settings.recording.remuxingDescription",
    });
    expect(invoke).toHaveBeenCalledWith("recover_orphan_recording", { orphanId: "orphan1" });
    scope.stop();
  });

  it("should dismiss orphan recording and update state", async () => {
    // Arrange
    const scope = effectScope();
    const { dismissOrphan, orphans } = scope.run(() => useRecording())!;
    orphans.value = [{ id: "orphan1", channel: "test", filename: "test.ts", sizeBytes: 100 }];

    // Act
    await dismissOrphan("orphan1");

    // Assert
    expect(invoke).toHaveBeenCalledWith("dismiss_orphan_recording", { orphanId: "orphan1" });
    expect(orphans.value).toHaveLength(0);
    scope.stop();
  });
  it("should check dependencies and update state", async () => {
    // Arrange
    const scope = effectScope();
    const { checkDependencies, isDependenciesInstalled } = scope.run(() => useRecording())!;
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "recording_check_dependencies") return true;
      if (cmd === "scan_orphans") return [];
      return null;
    });

    // Act
    const result = await checkDependencies();

    // Assert
    expect(result).toBe(true);
    expect(isDependenciesInstalled.value).toBe(true);
    expect(invoke).toHaveBeenCalledWith("recording_check_dependencies");
    expect(invoke).toHaveBeenCalledWith("scan_orphans", { outputDir: null });
    scope.stop();
  });

  it("should handle installDependencies success", async () => {
    // Arrange
    const scope = effectScope();
    const { installDependencies, isDependenciesInstalled } = scope.run(() => useRecording())!;
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    // Act
    await installDependencies();

    // Assert
    expect(isDependenciesInstalled.value).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("settings.recording.installSuccess");
    expect(invoke).toHaveBeenCalledWith("recording_install_dependencies");
    scope.stop();
  });

  it("should handle installDependencies error", async () => {
    // Arrange
    const scope = effectScope();
    const { installDependencies, isDependenciesInstalled } = scope.run(() => useRecording())!;
    vi.mocked(invoke).mockRejectedValueOnce(new Error("Network error"));

    // Act
    await installDependencies();

    // Assert
    expect(isDependenciesInstalled.value).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("settings.recording.installError");
    expect(invoke).toHaveBeenCalledWith("recording_install_dependencies");
    scope.stop();
  });

  it("should uninstall dependencies successfully", async () => {
    // Arrange
    const scope = effectScope();
    const { uninstallDependencies, isDependenciesInstalled } = scope.run(() => useRecording())!;
    isDependenciesInstalled.value = true;
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    // Act
    await uninstallDependencies();

    // Assert
    expect(isDependenciesInstalled.value).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("settings.recording.uninstallSuccess");
    expect(invoke).toHaveBeenCalledWith("recording_uninstall_dependencies");
    scope.stop();
  });

  it("should get env size", async () => {
    // Arrange
    const scope = effectScope();
    const { getEnvSize } = scope.run(() => useRecording())!;
    vi.mocked(invoke).mockResolvedValueOnce(184000000);

    // Act
    const size = await getEnvSize();

    // Assert
    expect(size).toBe(184000000);
    expect(invoke).toHaveBeenCalledWith("recording_get_env_size");
    scope.stop();
  });
});

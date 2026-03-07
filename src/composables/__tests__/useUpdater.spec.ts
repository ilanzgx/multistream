import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useUpdater, isTauri } from "../useUpdater";
import { toast } from "vue-sonner";
import * as tauriUpdater from "@tauri-apps/plugin-updater";
import * as tauriProcess from "@tauri-apps/plugin-process";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("vue-sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
  },
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

describe("useUpdater composable unit tests", () => {
  let sut: ReturnType<typeof useUpdater>;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Stub global window to simulate Tauri environment natively
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    sut = useUpdater();

    // Reset global refs states that persist between tests
    sut.updateAvailable.value = false;
    sut.updateVersion.value = null;
    sut.isChecking.value = false;
    sut.isDownloading.value = false;
    sut.downloadProgress.value = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("isTauri environment check", () => {
    it("should return false if window is undefined", () => {
      // Arrange
      vi.stubGlobal("window", undefined);

      // Assert
      expect(isTauri()).toBe(false);
    });

    it("should return false if __TAURI_INTERNALS__ is missing", () => {
      // Arrange
      vi.stubGlobal("window", { document: {} });

      // Assert
      expect(isTauri()).toBe(false);
    });

    it("should return true if __TAURI_INTERNALS__ exists", () => {
      // Assert
      expect(isTauri()).toBe(true);
    });
  });

  describe("installUpdate (early checks)", () => {
    it("should return early if there is no currentUpdate set", async () => {
      // currentUpdate still null
      // Act
      await sut.installUpdate();

      // Assert
      expect(sut.isDownloading.value).toBe(false);
      expect(toast.loading).not.toHaveBeenCalled();
    });
  });

  describe("checkForUpdates", () => {
    it("should return early if not in Tauri environment", async () => {
      // Arrange
      vi.stubGlobal("window", undefined);

      // Act
      await sut.checkForUpdates();

      // Assert
      expect(tauriUpdater.check).not.toHaveBeenCalled();
    });

    it("should return early if already checking", async () => {
      // Arrange
      sut.isChecking.value = true;

      // Act
      await sut.checkForUpdates();

      // Assert
      expect(tauriUpdater.check).not.toHaveBeenCalled();
    });

    it("should handle no update available (without toast)", async () => {
      // Arrange
      vi.mocked(tauriUpdater.check).mockResolvedValueOnce(null);

      // Act
      await sut.checkForUpdates();

      // Assert
      expect(sut.updateAvailable.value).toBe(false);
      expect(toast.success).not.toHaveBeenCalled();
      expect(sut.isChecking.value).toBe(false);
    });

    it("should handle no update available (with toast flag true)", async () => {
      // Arrange
      vi.mocked(tauriUpdater.check).mockResolvedValueOnce(null);

      // Act
      await sut.checkForUpdates(true);

      // Assert
      expect(toast.success).toHaveBeenCalledWith("toasts.update.latestVersion");
      expect(sut.isChecking.value).toBe(false);
    });

    it("should handle update available and assign to currentUpdate", async () => {
      // Arrange
      const mockUpdate = { version: "1.2.0" };
      vi.mocked(tauriUpdater.check).mockResolvedValueOnce(mockUpdate as any);

      // Act
      await sut.checkForUpdates();

      // Assert
      expect(sut.updateAvailable.value).toBe(true);
      expect(sut.updateVersion.value).toBe("1.2.0");
      expect(sut.isChecking.value).toBe(false);

      expect(toast.info).toHaveBeenCalledWith(
        "toasts.update.newVersion: 1.2.0",
        expect.objectContaining({
          action: expect.objectContaining({ label: "Update" }),
          duration: 10000,
        }),
      );
    });

    it("should successfully trigger installUpdate via toast action callback", async () => {
      // Arrange
      const mockUpdate = {
        version: "1.2.0",
        downloadAndInstall: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(tauriUpdater.check).mockResolvedValueOnce(mockUpdate as any);

      // Act
      await sut.checkForUpdates();

      // get toast action callback to simulate user click
      const toastInfoCall = vi.mocked(toast.info).mock.calls[0];
      const actionArgs = toastInfoCall![1] as any;
      const onClick = actionArgs?.action.onClick;

      // Assert
      expect(typeof onClick).toBe("function");

      // simulate user click on toast
      const installPromise = onClick();

      // Assert
      expect(sut.isDownloading.value).toBe(true);

      // wait for install to complete
      await installPromise;

      // Assert
      expect(sut.isDownloading.value).toBe(false);
    });

    it("should handle check error (without toast) properly", async () => {
      // Arrange
      vi.mocked(tauriUpdater.check).mockRejectedValueOnce(
        new Error("Network Error"),
      );

      // Act
      await sut.checkForUpdates();

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to check for updates:",
        expect.any(Error),
      );
      expect(toast.error).not.toHaveBeenCalled();
      expect(sut.isChecking.value).toBe(false);
    });

    it("should handle check error (with toast flag true)", async () => {
      // Arrange
      vi.mocked(tauriUpdater.check).mockRejectedValueOnce(
        new Error("Network Error"),
      );

      // Act
      await sut.checkForUpdates(true);

      // Assert
      expect(toast.error).toHaveBeenCalledWith("toasts.update.failedCheck");
      expect(sut.isChecking.value).toBe(false);
    });
  });

  describe("installUpdate execution logic", () => {
    it("should throw a loading toast, perform download, trigger progress blocks and relaunch", async () => {
      // Arrange
      const mockUpdate = {
        version: "2.0.0",
        downloadAndInstall: vi.fn().mockImplementation(async (callback) => {
          // Simulate download stream events
          callback({ event: "Started", data: { contentLength: 100 } });
          callback({ event: "Progress", data: { chunkLength: 50 } });
          callback({ event: "Progress", data: { chunkLength: 50 } });
          callback({ event: "Finished" });
        }),
      };
      vi.mocked(tauriUpdater.check).mockResolvedValueOnce(mockUpdate as any);
      await sut.checkForUpdates(); // fill currentUpdate

      // Act
      await sut.installUpdate();

      // Assert (States)
      expect(toast.loading).toHaveBeenCalledWith("toasts.update.downloading", {
        id: "update-download",
      });
      expect(mockUpdate.downloadAndInstall).toHaveBeenCalled();

      // Assert (Validation of console lines in Progress Callbacks)
      expect(consoleLogSpy).toHaveBeenCalledWith("Download started, size: 100");
      expect(consoleLogSpy).toHaveBeenCalledWith("Download finished");

      // Assert (Progress math added chunkLength)
      expect(sut.downloadProgress.value).toBe(100);

      // Assert (Final success and timeout delay)
      expect(toast.success).toHaveBeenCalledWith("toasts.update.success", {
        id: "update-download",
      });
      expect(sut.isDownloading.value).toBe(false);

      // Advance time by exactly 1500ms defined in the internal setTimeout
      await vi.advanceTimersByTimeAsync(1500);

      expect(tauriProcess.relaunch).toHaveBeenCalled();
    });

    it("should handle exceptions internally during installation and throw error toast", async () => {
      // Arrange
      const mockUpdate = {
        version: "2.1.0",
        downloadAndInstall: vi.fn().mockRejectedValue(new Error("Disc Full")),
      };
      vi.mocked(tauriUpdater.check).mockResolvedValueOnce(mockUpdate as any);
      await sut.checkForUpdates();

      // Act
      await sut.installUpdate();

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to install update:",
        expect.any(Error),
      );
      expect(toast.error).toHaveBeenCalledWith("toasts.update.failedUpdate", {
        id: "update-download",
      });
      expect(sut.isDownloading.value).toBe(false);
    });
  });
});

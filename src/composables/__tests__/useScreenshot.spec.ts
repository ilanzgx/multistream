import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useScreenshot } from "../useScreenshot";
import { toast } from "vue-sonner";
import * as tauriCore from "@tauri-apps/api/core";
import * as liveStatus from "../useLiveStatus";

vi.mock("vue-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("../useLiveStatus", () => ({
  isTauri: vi.fn(),
}));

describe("useScreenshot composable unit tests", () => {
  let sut: ReturnType<typeof useScreenshot>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    if (!globalThis.crypto) {
      globalThis.crypto = {
        randomUUID: () => "12345678-1234-1234-1234-123456789012" as `${string}-${string}-${string}-${string}-${string}`,
      } as any;
    } else if (!globalThis.crypto.randomUUID) {
      globalThis.crypto.randomUUID = () => "12345678-1234-1234-1234-123456789012" as `${string}-${string}-${string}-${string}-${string}`;
    }

    sut = useScreenshot();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should show error if no iframe is found in the container", async () => {
    // Arrange
    const dummyDiv = { querySelector: vi.fn().mockReturnValue(null) } as any;

    // Act
    await sut.captureStream(dummyDiv, "gaules", "twitch");

    // Assert
    expect(toast.error).toHaveBeenCalledWith("toasts.screenshot.noStream");
    expect(sut.isCapturing.value).toBe(false);
  });

  it("should show timeout error if iframe does not respond within 5s", async () => {
    // Arrange
    const mockWindow = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;
    globalThis.window = mockWindow;

    const dummyIframe = { contentWindow: { postMessage: vi.fn() } };
    const dummyDiv = { querySelector: vi.fn().mockReturnValue(dummyIframe) } as any;

    // Act
    const capturePromise = sut.captureStream(dummyDiv, "gaules", "twitch");
    
    // Fast forward passed the 5s timeout
    vi.advanceTimersByTime(5000);
    await capturePromise;

    // Assert
    expect(toast.error).toHaveBeenCalledWith("toasts.screenshot.timeout");
    expect(sut.isCapturing.value).toBe(false);
  });

  it("should show error if iframe responds with TAINTED_CANVAS", async () => {
    // Arrange
    let messageHandler: any;
    
    const mockWindow = {
      addEventListener: vi.fn((event, handler) => {
        if (event === "message") messageHandler = handler;
      }),
      removeEventListener: vi.fn(),
    } as any;
    globalThis.window = mockWindow;

    const dummyIframe = { 
      contentWindow: { 
        postMessage: vi.fn().mockImplementation((data) => {
          // simulate async response by calling the listener manually
          if (messageHandler) {
            messageHandler({
              data: {
                type: "MULTISTREAM_CAPTURE_RESULT",
                requestId: data.requestId,
                success: false,
                error: "TAINTED_CANVAS"
              }
            });
          }
        }) 
      } 
    };
    const dummyDiv = { querySelector: vi.fn().mockReturnValue(dummyIframe) } as any;

    // Act
    await sut.captureStream(dummyDiv, "gaules", "twitch");

    // Assert
    expect(toast.error).toHaveBeenCalledWith("toasts.screenshot.blocked");
  });

  it("should call Tauri invoke and toast success if isTauri is true", async () => {
    // Arrange
    vi.spyOn(liveStatus, "isTauri").mockReturnValue(true);
    vi.spyOn(tauriCore, "invoke").mockResolvedValue("/home/user/Pictures/Multistream/file.png");

    let messageHandler: any;
    const mockWindow = {
      addEventListener: vi.fn((event, handler) => {
        if (event === "message") messageHandler = handler;
      }),
      removeEventListener: vi.fn(),
    } as any;
    globalThis.window = mockWindow;

    const dummyIframe = { 
      contentWindow: { 
        postMessage: vi.fn().mockImplementation((data) => {
          if (messageHandler) {
            messageHandler({
              data: {
                type: "MULTISTREAM_CAPTURE_RESULT",
                requestId: data.requestId,
                success: true,
                dataUrl: "data:image/png;base64,mockdata"
              }
            });
          }
        }) 
      } 
    };
    const dummyDiv = { querySelector: vi.fn().mockReturnValue(dummyIframe) } as any;

    const mockDate = new Date("2026-04-02T13:42:16Z");
    vi.setSystemTime(mockDate);

    // Act
    await sut.captureStream(dummyDiv, "gaules", "twitch");

    // Assert
    expect(tauriCore.invoke).toHaveBeenCalledWith("save_screenshot", {
      dataUrl: "data:image/png;base64,mockdata",
      filename: "gaules_twitch_2026-04-02T13-42-16.png",
    });
    expect(toast.success).toHaveBeenCalledWith("toasts.screenshot.saved", expect.any(Object));
  });

  it("should trigger browser download if isTauri is false", async () => {
    // Arrange
    vi.spyOn(liveStatus, "isTauri").mockReturnValue(false);

    let messageHandler: any;
    const mockWindow = {
      addEventListener: vi.fn((event, handler) => {
        if (event === "message") messageHandler = handler;
      }),
      removeEventListener: vi.fn(),
    } as any;
    globalThis.window = mockWindow;

    const dummyIframe = { 
      contentWindow: { 
        postMessage: vi.fn().mockImplementation((data) => {
          if (messageHandler) {
            messageHandler({
              data: {
                type: "MULTISTREAM_CAPTURE_RESULT",
                requestId: data.requestId,
                success: true,
                dataUrl: "data:image/png;base64,mockdata"
              }
            });
          }
        }) 
      } 
    };
    const dummyDiv = { querySelector: vi.fn().mockReturnValue(dummyIframe) } as any;

    const mockAnchor = { href: "", download: "", click: vi.fn() };
    globalThis.document = {
      createElement: vi.fn().mockImplementation((tagName) => {
        if (tagName === "a") return mockAnchor;
        return {};
      })
    } as any;

    // Act
    await sut.captureStream(dummyDiv, "shroud", "youtube");

    // Assert
    expect(mockAnchor.href).toBe("data:image/png;base64,mockdata");
    expect(mockAnchor.download).toMatch(/^shroud_youtube_.*\.png$/);
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("toasts.screenshot.saved");

    delete (globalThis as any).document;
  });
});

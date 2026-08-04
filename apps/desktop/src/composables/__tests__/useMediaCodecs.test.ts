import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as updaterMod from "../useUpdater";
import { toast } from "vue-sonner";

// Arrange
vi.mock("vue-sonner", () => ({
  toast: {
    warning: vi.fn(),
  },
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../useUpdater", () => ({
  isTauri: vi.fn(),
}));

describe("useMediaCodecs", () => {
  let canPlayTypeMock: ReturnType<typeof vi.fn>;
  let createElementMock: ReturnType<typeof vi.fn>;
  let useMediaCodecs: any;

  beforeEach(async () => {
    vi.resetModules();
    useMediaCodecs = (await import("../useMediaCodecs")).useMediaCodecs;
    vi.clearAllMocks();

    canPlayTypeMock = vi.fn();
    createElementMock = vi.fn().mockImplementation((tagName: string) => {
      if (tagName === "video") return { canPlayType: canPlayTypeMock };
      return {};
    });

    vi.stubGlobal("navigator", { userAgent: "" });
    vi.stubGlobal("document", { createElement: createElementMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const setUserAgent = (ua: string) => {
    vi.stubGlobal("navigator", { userAgent: ua });
  };

  it("should not check codecs if not in Tauri", () => {
    // Arrange
    vi.mocked(updaterMod.isTauri).mockReturnValue(false);
    setUserAgent("Linux");

    // Act
    const { checkVideoCodecs } = useMediaCodecs();
    checkVideoCodecs();

    // Assert
    expect(createElementMock).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("should not check codecs if OS is Windows", () => {
    // Arrange
    vi.mocked(updaterMod.isTauri).mockReturnValue(true);
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

    // Act
    const { checkVideoCodecs } = useMediaCodecs();
    checkVideoCodecs();

    // Assert
    expect(createElementMock).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("should not check codecs if OS is macOS", () => {
    // Arrange
    vi.mocked(updaterMod.isTauri).mockReturnValue(true);
    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");

    // Act
    const { checkVideoCodecs } = useMediaCodecs();
    checkVideoCodecs();

    // Assert
    expect(createElementMock).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("should show warning toast if on Linux and codec is not supported", () => {
    // Arrange
    vi.mocked(updaterMod.isTauri).mockReturnValue(true);
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64)");
    canPlayTypeMock.mockReturnValue(""); // Empty string means unsupported

    // Act
    const { checkVideoCodecs } = useMediaCodecs();
    checkVideoCodecs();

    // Assert
    expect(createElementMock).toHaveBeenCalledWith("video");
    expect(canPlayTypeMock).toHaveBeenCalledWith('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
    expect(toast.warning).toHaveBeenCalledWith("toasts.codecs.missing", { duration: 8000 });
  });

  it("should not show warning toast if on Linux and codec is supported", () => {
    // Arrange
    vi.mocked(updaterMod.isTauri).mockReturnValue(true);
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64)");
    canPlayTypeMock.mockReturnValue("probably"); // Supported

    // Act
    const { checkVideoCodecs } = useMediaCodecs();
    checkVideoCodecs();

    // Assert
    expect(createElementMock).toHaveBeenCalledWith("video");
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("should only show the warning toast once per session", () => {
    // Arrange
    vi.mocked(updaterMod.isTauri).mockReturnValue(true);
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64)");
    canPlayTypeMock.mockReturnValue("");

    const { checkVideoCodecs } = useMediaCodecs();

    // Act
    checkVideoCodecs();
    checkVideoCodecs(); // second call
    checkVideoCodecs(); // third call

    // Assert
    expect(createElementMock).toHaveBeenCalledTimes(1); // Only checked once
    expect(toast.warning).toHaveBeenCalledTimes(1); // Only warned once
  });
});

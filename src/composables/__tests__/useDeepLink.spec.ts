import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDeepLink } from "../useDeepLink";
import { useStreams } from "../useStreams";
import { toast } from "vue-sonner";
import { onOpenUrl, getCurrent } from "@tauri-apps/plugin-deep-link";
import { onMounted, onUnmounted } from "vue";

vi.mock("vue", () => ({
  onMounted: vi.fn((fn) => fn()),
  onUnmounted: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-deep-link", () => ({
  onOpenUrl: vi.fn(),
  getCurrent: vi.fn(),
}));

vi.mock("../useStreams", () => ({
  useStreams: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}));

vi.mock("../../i18n", () => ({
  i18n: {
    global: {
      t: (key: string) => key,
    },
  },
}));

describe("useDeepLink", () => {
  const mockAddStream = vi.fn();
  const mockClearStreams = vi.fn();
  const mockUnlisten = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStreams).mockReturnValue({
      addStream: mockAddStream,
      clearStreams: mockClearStreams,
    } as any);
    vi.mocked(onOpenUrl).mockResolvedValue(mockUnlisten);
    vi.mocked(getCurrent).mockResolvedValue(null);
  });

  it("registers onOpenUrl and gets initial urls on mount", async () => {
    useDeepLink();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onMounted).toHaveBeenCalled();
    expect(onOpenUrl).toHaveBeenCalled();
    expect(getCurrent).toHaveBeenCalled();
  });

  it("handles valid deep link from onOpenUrl and translates toast", async () => {
    let urlHandler: (urls: string[]) => void = () => {};
    vi.mocked(onOpenUrl).mockImplementation(async (handler) => {
      urlHandler = handler;
      return mockUnlisten;
    });

    useDeepLink();

    // Simulate deep link triggered
    await urlHandler(["multistream://share?streams=twitch:s0mcs"]);

    expect(mockClearStreams).toHaveBeenCalled();
    expect(mockAddStream).toHaveBeenCalledWith("s0mcs", "twitch", undefined);
    expect(toast.success).toHaveBeenCalledWith("import.deepLinkSuccess");
  });

  it("handles initial urls from getCurrent and translates toast", async () => {
    vi.mocked(getCurrent).mockResolvedValue(["multistream://share?streams=youtube:qGYemvUYAac"]);

    useDeepLink();

    // Wait for async onMounted block to execute
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockClearStreams).toHaveBeenCalled();
    expect(mockAddStream).toHaveBeenCalledWith("qGYemvUYAac", "youtube", undefined);
    expect(toast.success).toHaveBeenCalledWith("import.deepLinkSuccess");
  });

  it("ignores invalid deep links", async () => {
    let urlHandler: (urls: string[]) => void = () => {};
    vi.mocked(onOpenUrl).mockImplementation(async (handler) => {
      urlHandler = handler;
      return mockUnlisten;
    });

    useDeepLink();

    await urlHandler(["invalid://share?streams=twitch:s0mcs"]);

    expect(mockClearStreams).not.toHaveBeenCalled();
    expect(mockAddStream).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("cleans up listener on unmount", async () => {
    useDeepLink();

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Call the mock unmounted
    const unmountCb = vi.mocked(onUnmounted).mock.calls[0]![0] as () => void;
    unmountCb();

    expect(mockUnlisten).toHaveBeenCalled();
  });
});

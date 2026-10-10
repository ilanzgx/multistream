import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Stream resilience and reload coordination", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should preserve original iframe query parameters while injecting _ms_reload cache-buster", () => {
    // Arrange
    const originalUrl =
      "https://player.twitch.tv/?channel=gaules&parent=localhost&autoplay=true&muted=true";
    const timestamp = 1760000000000;
    vi.setSystemTime(new Date(timestamp));

    // Act
    const parsed = new URL(originalUrl);
    parsed.searchParams.set("_ms_reload", Date.now().toString());
    const result = parsed.toString();

    // Assert
    expect(result).toContain("channel=gaules");
    expect(result).toContain("parent=localhost");
    expect(result).toContain("autoplay=true");
    expect(result).toContain("muted=true");
    expect(result).toContain("_ms_reload=1760000000000");
  });

  it("should correctly update existing _ms_reload timestamp without duplicating query keys", () => {
    // Arrange
    const initialUrl = "https://player.kick.cx/xqc?_ms_reload=1000";
    const newTimestamp = 2000;
    vi.setSystemTime(new Date(newTimestamp));

    // Act
    const parsed = new URL(initialUrl);
    parsed.searchParams.set("_ms_reload", Date.now().toString());
    const result = parsed.toString();

    // Assert
    expect(result).toBe("https://player.kick.cx/xqc?_ms_reload=2000");
    expect(parsed.searchParams.getAll("_ms_reload")).toHaveLength(1);
  });

  it("should notify child native players when multistream-reload-stream event is dispatched", () => {
    // Arrange
    const bus = new EventTarget();
    const channel = "gaules";
    const channelid = "stream-123";
    const listener = vi.fn();

    bus.addEventListener("multistream-reload-stream", listener);

    // Act
    bus.dispatchEvent(
      new CustomEvent("multistream-reload-stream", {
        detail: { channel, channelid },
      })
    );

    // Assert
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]![0] as CustomEvent;
    expect(event.detail.channel).toBe("gaules");
    expect(event.detail.channelid).toBe("stream-123");
  });

  it("should ignore reload events targeted at other channels", () => {
    // Arrange
    const bus = new EventTarget();
    const myChannel = "gaules";
    const reloadHandler = vi.fn();

    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ channel?: string; channelid?: string }>;
      if (!customEvent.detail || customEvent.detail.channel === myChannel) {
        reloadHandler();
      }
    };

    bus.addEventListener("multistream-reload-stream", handler);

    // Act
    bus.dispatchEvent(
      new CustomEvent("multistream-reload-stream", {
        detail: { channel: "loud_coringa", channelid: "stream-456" },
      })
    );

    // Assert
    expect(reloadHandler).not.toHaveBeenCalled();
  });

  it("should match by channelid when provided, even if channel name is identical", () => {
    // Arrange
    const bus = new EventTarget();
    const myChannel = "gaules";
    const myChannelId = "stream-1";
    const otherChannelId = "stream-2";
    const reloadHandler1 = vi.fn();
    const reloadHandler2 = vi.fn();

    const createHandler = (channel: string, channelid: string, cb: () => void) => (e: Event) => {
      const customEvent = e as CustomEvent<{ channel?: string; channelid?: string }>;
      if (!customEvent.detail) {
        cb();
        return;
      }
      if (customEvent.detail.channelid && channelid) {
        if (customEvent.detail.channelid === channelid) {
          cb();
        }
      } else if (customEvent.detail.channel === channel) {
        cb();
      }
    };

    bus.addEventListener(
      "multistream-reload-stream",
      createHandler(myChannel, myChannelId, reloadHandler1)
    );
    bus.addEventListener(
      "multistream-reload-stream",
      createHandler(myChannel, otherChannelId, reloadHandler2)
    );

    // Act - target only stream-2
    bus.dispatchEvent(
      new CustomEvent("multistream-reload-stream", {
        detail: { channel: myChannel, channelid: otherChannelId },
      })
    );

    // Assert
    expect(reloadHandler1).not.toHaveBeenCalled();
    expect(reloadHandler2).toHaveBeenCalledTimes(1);
  });
});

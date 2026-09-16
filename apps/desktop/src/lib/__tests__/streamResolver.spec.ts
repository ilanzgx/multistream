import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveStream } from "../streamResolver";
import { invoke, isTauri } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));

describe("streamResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTauri).mockReturnValue(true);
  });

  it("should return null for empty channel", async () => {
    // Arrange & Act
    const result = await resolveStream({ channel: "   ", platform: "twitch" });

    // Assert
    expect(result).toBeNull();
  });

  it("should return twitch streams as is", async () => {
    // Arrange & Act
    const result = await resolveStream({ channel: "@gaules", platform: "twitch" });

    // Assert
    expect(result).toEqual({
      channel: "gaules",
      platform: "twitch",
      iframeUrl: undefined,
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("should return kick streams as is", async () => {
    // Arrange & Act
    const result = await resolveStream({ channel: "xqc", platform: "kick" });

    // Assert
    expect(result).toEqual({
      channel: "xqc",
      platform: "kick",
      iframeUrl: undefined,
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("should return custom streams with iframeUrl as is", async () => {
    // Arrange & Act
    const result = await resolveStream({
      channel: "Custom 1",
      platform: "custom",
      iframeUrl: "https://example.com/embed",
    });

    // Assert
    expect(result).toEqual({
      channel: "Custom 1",
      platform: "custom",
      iframeUrl: "https://example.com/embed",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("should return 11-character YouTube video IDs directly without invoke", async () => {
    // Arrange
    const videoId = "5pzeFSTt18c";

    // Act
    const result = await resolveStream({ channel: videoId, platform: "youtube" });

    // Assert
    expect(result).toEqual({
      channel: videoId,
      platform: "youtube",
      iframeUrl: undefined,
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("should resolve YouTube channel handles via invoke", async () => {
    // Arrange
    vi.mocked(invoke).mockResolvedValueOnce("5pzeFSTt18c");

    // Act
    const result = await resolveStream({ channel: "@batzera1", platform: "youtube" });

    // Assert
    expect(invoke).toHaveBeenCalledWith("youtube_resolve_live_id", {
      channelOrHandle: "batzera1",
    });
    expect(result).toEqual({
      channel: "5pzeFSTt18c",
      platform: "youtube",
      displayName: "batzera1",
      handle: "batzera1",
    });
  });

  it("should return null if YouTube channel handle resolution returns null (offline)", async () => {
    // Arrange
    vi.mocked(invoke).mockResolvedValueOnce(null);

    // Act
    const result = await resolveStream({ channel: "batzera1", platform: "youtube" });

    // Assert
    expect(invoke).toHaveBeenCalledWith("youtube_resolve_live_id", {
      channelOrHandle: "batzera1",
    });
    expect(result).toBeNull();
  });

  it("should return null if YouTube channel handle resolution throws", async () => {
    // Arrange
    vi.mocked(invoke).mockRejectedValueOnce(new Error("Network failed"));

    // Act
    const result = await resolveStream({ channel: "batzera1", platform: "youtube" });

    // Assert
    expect(invoke).toHaveBeenCalledWith("youtube_resolve_live_id", {
      channelOrHandle: "batzera1",
    });
    expect(result).toBeNull();
  });

  it("should resolve explicit 11-character @ handles via invoke instead of treating as video ID", async () => {
    // Arrange
    vi.mocked(invoke).mockResolvedValueOnce("realVideoId1");

    // Act
    const result = await resolveStream({ channel: "@abcdefghijk", platform: "youtube" });

    // Assert
    expect(invoke).toHaveBeenCalledWith("youtube_resolve_live_id", {
      channelOrHandle: "abcdefghijk",
    });
    expect(result).toEqual({
      channel: "realVideoId1",
      platform: "youtube",
      displayName: "abcdefghijk",
      handle: "abcdefghijk",
    });
  });

  it("should fallback to raw channel when not in Tauri environment", async () => {
    // Arrange
    vi.mocked(isTauri).mockReturnValue(false);

    // Act
    const result = await resolveStream({ channel: "@batzera1", platform: "youtube" });

    // Assert
    expect(result).toEqual({
      channel: "batzera1",
      platform: "youtube",
      iframeUrl: undefined,
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});

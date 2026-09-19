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

  it("should resolve 11-character YouTube channel handles without @ via invoke", async () => {
    // Arrange
    vi.mocked(invoke).mockResolvedValueOnce("8HLTlILsQCQ");

    // Act
    const result = await resolveStream({ channel: "canalgoatbr", platform: "youtube" });

    // Assert
    expect(invoke).toHaveBeenCalledWith("youtube_resolve_live_id", {
      channelOrHandle: "canalgoatbr",
    });
    expect(result).toEqual({
      channel: "8HLTlILsQCQ",
      platform: "youtube",
      displayName: "canalgoatbr",
      handle: "canalgoatbr",
    });
  });

  it("should return null for 11-character YouTube channel handles when offline", async () => {
    // Arrange
    vi.mocked(invoke).mockResolvedValueOnce(null);

    // Act
    const result = await resolveStream({ channel: "canalgoatbr", platform: "youtube" });

    // Assert
    expect(invoke).toHaveBeenCalledWith("youtube_resolve_live_id", {
      channelOrHandle: "canalgoatbr",
    });
    expect(result).toBeNull();
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

  it("should resolve YouTube video ID using getStatus metadata when available", async () => {
    // Arrange
    vi.mocked(invoke).mockResolvedValueOnce("Zm5YJptWpa4");
    const mockGetStatus = vi.fn().mockReturnValue({
      displayName: "CazéTV",
      handle: "@CazeTV",
    });

    // Act
    const result = await resolveStream(
      { channel: "Zm5YJptWpa4", platform: "youtube" },
      mockGetStatus
    );

    // Assert
    expect(result).toEqual({
      channel: "Zm5YJptWpa4",
      platform: "youtube",
      displayName: "CazéTV",
      handle: "CazeTV",
    });
  });

  it("should leave displayName and handle undefined when YouTube stream input is a raw video ID without status", async () => {
    // Arrange
    vi.mocked(invoke).mockResolvedValueOnce("Zm5YJptWpa4");

    // Act
    const result = await resolveStream({ channel: "Zm5YJptWpa4", platform: "youtube" });

    // Assert
    expect(result).toEqual({
      channel: "Zm5YJptWpa4",
      platform: "youtube",
      displayName: undefined,
      handle: undefined,
    });
  });

  it("should preserve distinct video IDs when resolving multiple concurrent live streams from the same channel", async () => {
    // Arrange
    const videoIds = ["Zm5YJptWpa4", "cDvqBEla-Vc", "QQbVDgHCW-g", "TmwEk5lnQpo"];
    for (const vid of videoIds) {
      vi.mocked(invoke).mockResolvedValueOnce(vid);
    }

    // Act
    const results = [];
    for (const vid of videoIds) {
      const res = await resolveStream({ channel: vid, platform: "youtube" });
      results.push(res?.channel);
    }

    // Assert
    expect(results).toEqual(videoIds);
    expect(new Set(results).size).toBe(4);
  });
});

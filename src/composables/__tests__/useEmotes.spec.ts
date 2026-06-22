import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEmotes } from "../useEmotes";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("useEmotes", () => {
  let sut: ReturnType<typeof useEmotes>;

  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (url: string) => {
      if (url?.includes("betterttv.net/3/cached/emotes/global")) {
        return { ok: true, json: async () => [] };
      }
      return {
        ok: true,
        json: async () => ({}),
        text: async () => "",
      };
    });
    // Arrange: Get a fresh instance of the composable
    sut = useEmotes();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should parse pure text message correctly", () => {
    // Arrange
    const text = "Hello world this is a test";
    const channel = "testchannel";

    // Act
    const result = sut.parseMessage(text, null, channel);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: "text", content: text });
  });

  it("should parse native Twitch emotes correctly based on indices", () => {
    // Arrange
    const text = "Hello Kappa world";
    const channel = "testchannel";
    // Kappa starts at index 6, ends at index 10
    const twitchEmotesStr = "25:6-10";

    // Act
    const result = sut.parseMessage(text, twitchEmotesStr, channel);

    // Assert
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: "text", content: "Hello " });
    expect(result[1]).toEqual({
      type: "emote",
      content: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0",
      code: "Kappa",
    });
    expect(result[2]).toEqual({ type: "text", content: " world" });
  });

  it("should handle multiple native Twitch emotes", () => {
    // Arrange
    const text = "Kappa Kappa Kappa";
    const channel = "testchannel";
    // Kappa: 0-4, 6-10, 12-16
    const twitchEmotesStr = "25:0-4,6-10,12-16";

    // Act
    const result = sut.parseMessage(text, twitchEmotesStr, channel);

    // Assert
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({
      type: "emote",
      content: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0",
      code: "Kappa",
    });
    expect(result[1]).toEqual({ type: "text", content: " " });
    expect(result[2]).toEqual({
      type: "emote",
      content: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0",
      code: "Kappa",
    });
    expect(result[3]).toEqual({ type: "text", content: " " });
    expect(result[4]).toEqual({
      type: "emote",
      content: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0",
      code: "Kappa",
    });
  });

  it("should fetch and parse global 3rd party emotes", async () => {
    // Arrange
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("7tv.io/v3/emote-sets/global")) {
        return {
          ok: true,
          json: async () => ({
            emotes: [{ id: "7tv_123", name: "SEVENTV" }],
          }),
        };
      }
      if (url.includes("betterttv.net/3/cached/emotes/global")) {
        return {
          ok: true,
          json: async () => [{ id: "bttv_123", code: "BTTVGLOBAL" }],
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    // Reset sut to trigger global emote fetch on initialization
    sut = useEmotes();

    // Allow promises to resolve
    await new Promise((resolve) => setTimeout(resolve, 0));

    const text = "Hello SEVENTV and BTTVGLOBAL";

    // Act
    const result = sut.parseMessage(text, null, "anychannel");

    // Assert
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ type: "text", content: "Hello " });
    expect(result[1]).toEqual({
      type: "emote",
      content: "https://cdn.7tv.app/emote/7tv_123/1x.webp",
      code: "SEVENTV",
    });
    expect(result[2]).toEqual({ type: "text", content: " and " });
    expect(result[3]).toEqual({
      type: "emote",
      content: "https://cdn.betterttv.net/emote/bttv_123/1x",
      code: "BTTVGLOBAL",
    });
  });

  it("should fetch and parse channel specific 3rd party emotes", async () => {
    // Arrange
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("decapi.me/twitch/id/gaules")) {
        return { ok: true, text: async () => "123456" };
      }
      if (url.includes("7tv.io/v3/users/twitch/123456")) {
        return {
          ok: true,
          json: async () => ({
            emote_set: { emotes: [{ id: "7tv_ch_1", name: "Gaules7TV" }] },
          }),
        };
      }
      if (url.includes("betterttv.net/3/cached/users/twitch/123456")) {
        return {
          ok: true,
          json: async () => ({
            channelEmotes: [{ id: "bttv_ch_1", code: "GaulesBTTV" }],
            sharedEmotes: [{ id: "bttv_sh_1", code: "SharedBTTV" }],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    // Act
    await sut.loadChannelEmotes("gaules");
    const result = sut.parseMessage("Gaules7TV GaulesBTTV SharedBTTV", null, "gaules");

    // Assert
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({
      type: "emote",
      content: "https://cdn.7tv.app/emote/7tv_ch_1/1x.webp",
      code: "Gaules7TV",
    });
    expect(result[2]).toEqual({
      type: "emote",
      content: "https://cdn.betterttv.net/emote/bttv_ch_1/1x",
      code: "GaulesBTTV",
    });
    expect(result[4]).toEqual({
      type: "emote",
      content: "https://cdn.betterttv.net/emote/bttv_sh_1/1x",
      code: "SharedBTTV",
    });
  });

  it("should ignore invalid fetch operations gracefully", async () => {
    // Arrange
    mockFetch.mockResolvedValue({ ok: false }); // Force fetch failure

    // Act
    await sut.loadChannelEmotes("invaliduser");
    const result = sut.parseMessage("Some Emote", null, "invaliduser");

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: "text", content: "Some Emote" });
  });
});

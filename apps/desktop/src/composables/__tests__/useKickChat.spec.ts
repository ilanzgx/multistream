import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useKickChat, __test_resetKickChatState, type KickChatMessage } from "../useKickChat";

describe("useKickChat", () => {
  beforeEach(() => {
    __test_resetKickChatState();
    vi.clearAllMocks();
    (listen as ReturnType<typeof vi.fn>).mockResolvedValue(vi.fn());

    // Mock global fetch
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets up IPC listeners upon initialization", async () => {
    // Arrange
    const channelSlug = "testchannel";

    // Act
    useKickChat(channelSlug);
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(listen).toHaveBeenCalledWith("kick-connection-state", expect.any(Function));
    expect(listen).toHaveBeenCalledWith("kick-chat-message", expect.any(Function));
  });

  it("fetches chatroom id and joins channel", async () => {
    // Arrange
    const channelSlug = "xqc";
    const mockResponse = {
      ok: true,
      json: async () => ({ chatroom: { id: 12345 } }),
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const { joinChannel } = useKickChat(channelSlug);

    // Act
    await joinChannel();

    // Assert
    expect(globalThis.fetch).toHaveBeenCalledWith(`https://kick.com/api/v1/channels/xqc`);
    expect(invoke).toHaveBeenCalledWith("kick_set_channels", {
      channels: [["xqc", 12345]],
    });
  });

  it("leaves channel and updates subscriptions", async () => {
    // Arrange
    const channelSlug = "xqc";
    const mockResponse = {
      ok: true,
      json: async () => ({ chatroom: { id: 12345 } }),
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const { joinChannel, leaveChannel } = useKickChat(channelSlug);
    await joinChannel(); // Ensure it is joined first
    vi.mocked(invoke).mockClear();

    // Act
    await leaveChannel();

    // Assert
    expect(invoke).toHaveBeenCalledWith("kick_set_channels", {
      channels: [],
    });
  });

  it("adds and removes local optimistic messages", () => {
    // Arrange
    const channelSlug = "testchannel";
    const { addLocalMessage, removeLastLocalMessage, channelMessagesMap } =
      useKickChat(channelSlug);

    const testMessage: KickChatMessage = {
      id: "local-1",
      channel: "testchannel",
      username: "user1",
      display_name: "User1",
      message: "Hello world",
      timestamp_ms: Date.now(),
      badges: [],
      isPending: true,
      platform: "kick",
    };

    // Act
    addLocalMessage(testMessage);

    // Assert
    expect(channelMessagesMap.value[channelSlug.toLowerCase()]).toContainEqual(testMessage);

    // Act 2
    const removedText = removeLastLocalMessage("user1");

    // Assert 2
    expect(removedText).toBe("Hello world");
    expect(channelMessagesMap.value[channelSlug.toLowerCase()]).not.toContainEqual(testMessage);
  });

  it("returns null if trying to remove local message for unknown user", () => {
    // Arrange
    const channelSlug = "testchannel";
    const { addLocalMessage, removeLastLocalMessage } = useKickChat(channelSlug);

    const testMessage: KickChatMessage = {
      id: "local-1",
      channel: "testchannel",
      username: "user1",
      display_name: "User1",
      message: "Hello world",
      timestamp_ms: Date.now(),
      badges: [],
      isPending: true,
      platform: "kick",
    };

    // Act
    addLocalMessage(testMessage);
    const removedText = removeLastLocalMessage("unknownuser");

    // Assert
    expect(removedText).toBeNull();
  });
});

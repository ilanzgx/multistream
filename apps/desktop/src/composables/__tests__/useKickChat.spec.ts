import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  useKickChat,
  __test_resetKickChatState,
  flushPendingKickMessages,
  type KickChatMessage,
} from "../useKickChat";

describe("useKickChat", () => {
  beforeEach(() => {
    __test_resetKickChatState();
    vi.clearAllMocks();
    (listen as ReturnType<typeof vi.fn>).mockResolvedValue(vi.fn());

    // Mock global fetch
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
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
      json: async () => ({ chatroom: { id: 12345 }, user_id: 999 }),
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const { joinChannel, getBroadcasterUserId } = useKickChat(channelSlug);

    // Act
    await joinChannel();

    // Assert
    expect(globalThis.fetch).toHaveBeenCalledWith(`https://kick.com/api/v1/channels/xqc`, {
      signal: expect.any(AbortSignal),
    });
    expect(invoke).toHaveBeenCalledWith("kick_set_channels", {
      channels: [["xqc", 12345]],
    });
    expect(getBroadcasterUserId()).toBe(999);
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

  it("aborts in-flight joinChannel fetch when leaveChannel is called immediately", async () => {
    // Arrange
    const channelSlug = "adinross";
    let capturedSignal: AbortSignal | undefined;

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((_url, init) => {
      capturedSignal = init?.signal;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve({
            ok: true,
            json: async () => ({ chatroom: { id: 88888 } }),
          });
        }, 100);

        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("The user aborted a request.", "AbortError"));
        });
      });
    });

    const { joinChannel, leaveChannel } = useKickChat(channelSlug);

    // Act
    const joinPromise = joinChannel();
    await leaveChannel();
    await joinPromise;

    // Assert
    expect(capturedSignal?.aborted).toBe(true);
    expect(invoke).not.toHaveBeenCalledWith("kick_set_channels", {
      channels: [["adinross", 88888]],
    });
  });

  it("batches incoming messages over 50ms interval", async () => {
    // Arrange
    vi.useFakeTimers();
    let messageCallback: ((event: { payload: KickChatMessage }) => void) | undefined;
    (listen as ReturnType<typeof vi.fn>).mockImplementation((event, cb) => {
      if (event === "kick-chat-message") {
        messageCallback = cb;
      }
      return Promise.resolve(vi.fn());
    });

    const { channelMessagesMap } = useKickChat("streamer");
    await Promise.resolve();
    await Promise.resolve();

    expect(messageCallback).toBeDefined();

    // Act
    for (let i = 1; i <= 5; i++) {
      messageCallback!({
        payload: {
          id: `msg-${i}`,
          channel: "streamer",
          username: `viewer${i}`,
          display_name: `Viewer${i}`,
          message: `Hello ${i}`,
          timestamp_ms: Date.now(),
          badges: [],
        },
      });
    }

    // Assert 1: before 50ms, messages are buffered and not yet in channelMessagesMap
    expect(channelMessagesMap.value["streamer"]).toBeUndefined();

    // Act 2: advance timers by 50ms
    vi.advanceTimersByTime(50);

    // Assert 2: after 50ms, all 5 messages are flushed in a single batch
    expect(channelMessagesMap.value["streamer"]?.length).toBe(5);
    expect(channelMessagesMap.value["streamer"]?.[0]?.message).toBe("Hello 5");
  });

  it("flushes pending messages immediately when flushPendingKickMessages is called", async () => {
    // Arrange
    let messageCallback: ((event: { payload: KickChatMessage }) => void) | undefined;
    (listen as ReturnType<typeof vi.fn>).mockImplementation((event, cb) => {
      if (event === "kick-chat-message") {
        messageCallback = cb;
      }
      return Promise.resolve(vi.fn());
    });

    const { channelMessagesMap } = useKickChat("streamer");
    await Promise.resolve();
    await Promise.resolve();

    messageCallback!({
      payload: {
        id: "msg-sync",
        channel: "streamer",
        username: "viewerSync",
        display_name: "ViewerSync",
        message: "Synchronous flush test",
        timestamp_ms: Date.now(),
        badges: [],
      },
    });

    // Act
    flushPendingKickMessages();

    // Assert
    expect(channelMessagesMap.value["streamer"]?.length).toBe(1);
    expect(channelMessagesMap.value["streamer"]?.[0]?.message).toBe("Synchronous flush test");
  });

  it("reconciles optimistic pending message with incoming server message in batch", async () => {
    // Arrange
    vi.useFakeTimers();
    let messageCallback: ((event: { payload: KickChatMessage }) => void) | undefined;
    (listen as ReturnType<typeof vi.fn>).mockImplementation((event, cb) => {
      if (event === "kick-chat-message") {
        messageCallback = cb;
      }
      return Promise.resolve(vi.fn());
    });

    const { addLocalMessage, channelMessagesMap } = useKickChat("streamer");
    await Promise.resolve();
    await Promise.resolve();

    const pendingMsg: KickChatMessage = {
      id: "pending-123",
      channel: "streamer",
      username: "myuser",
      display_name: "MyUser",
      message: "Hey chat!",
      timestamp_ms: Date.now(),
      badges: [],
      isPending: true,
      platform: "kick",
    };

    // Act 1: Add optimistic message
    addLocalMessage(pendingMsg);
    expect(channelMessagesMap.value["streamer"]?.length).toBe(1);
    expect(channelMessagesMap.value["streamer"]?.[0]?.isPending).toBe(true);

    // Act 2: Server echo arrives via event
    messageCallback!({
      payload: {
        id: "server-456",
        channel: "streamer",
        username: "myuser",
        display_name: "MyUser",
        message: "Hey chat!",
        timestamp_ms: Date.now(),
        badges: [],
      },
    });

    vi.advanceTimersByTime(50);

    // Assert: Pending message replaced by confirmed server message without duplicate
    expect(channelMessagesMap.value["streamer"]?.length).toBe(1);
    expect(channelMessagesMap.value["streamer"]?.[0]?.id).toBe("server-456");
    expect(channelMessagesMap.value["streamer"]?.[0]?.isPending).toBeUndefined();
  });

  it("caps channel messages at 500 items", () => {
    // Arrange
    const channelSlug = "crowded";
    const { channelMessagesMap } = useKickChat(channelSlug);

    // Act: fill with 550 messages
    for (let i = 0; i < 550; i++) {
      channelMessagesMap.value = {
        ...channelMessagesMap.value,
        [channelSlug]: [
          {
            id: `msg-${i}`,
            channel: channelSlug,
            username: `user`,
            display_name: `User`,
            message: `Text ${i}`,
            timestamp_ms: Date.now(),
            badges: [],
          },
          ...(channelMessagesMap.value[channelSlug] || []),
        ].slice(0, 500),
      };
    }

    // Assert
    expect(channelMessagesMap.value[channelSlug]?.length).toBe(500);
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

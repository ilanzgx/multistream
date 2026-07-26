import { effectScope, type EffectScope, ref } from "vue";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UNIFIED_CHAT_ID } from "../useUnifiedChat";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

const mockIsTauri = ref(true);
vi.mock("@/composables/useUpdater", () => ({
  isTauri: () => mockIsTauri.value,
}));

const mockStreams = ref([
  { id: "1", channel: "gaules", platform: "twitch" },
  { id: "2", channel: "cellbit", platform: "twitch" },
  { id: "3", channel: "somekick", platform: "kick" },
]);

vi.mock("@/composables/useStreams", () => ({
  useStreams: () => ({ streams: mockStreams }),
}));

const mockAuth = ref(true);
vi.mock("@/composables/useTwitchAuth", () => ({
  useTwitchAuth: () => ({
    authenticated: mockAuth,
    username: ref("testuser"),
    login: vi.fn(),
    logout: vi.fn(),
    loading: ref(false),
  }),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useUnifiedChat } from "../useUnifiedChat";

type EventCallback = (event?: any) => void;

describe("useUnifiedChat", () => {
  let scope: EffectScope;
  const listenerCallbacks: Record<string, EventCallback> = {};
  const unlistenFns: Record<string, ReturnType<typeof vi.fn>> = {};

  beforeEach(() => {
    scope = effectScope();
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockIsTauri.value = true;
    mockAuth.value = true;
    for (const key in listenerCallbacks) {
      delete listenerCallbacks[key];
    }

    mockStreams.value = [
      { id: "1", channel: "gaules", platform: "twitch" },
      { id: "2", channel: "cellbit", platform: "twitch" },
      { id: "3", channel: "somekick", platform: "kick" },
    ];

    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === "twitch_get_connection_state") {
        return Promise.resolve({ state: "connected" });
      }
      if (cmd === "twitch_get_messages") {
        return Promise.resolve([
          {
            id: "m1",
            channel: "gaules",
            username: "user1",
            display_name: "User1",
            message: "old msg",
            timestamp_ms: 1000,
            color: null,
            badges: [],
            emotes: null,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    (listen as ReturnType<typeof vi.fn>).mockImplementation((event: string, cb: EventCallback) => {
      listenerCallbacks[event] = cb;
      const unlisten = vi.fn();
      unlistenFns[event] = unlisten;
      return Promise.resolve(unlisten);
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (typeof url === "string" && url.includes("decapi.me")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve("https://avatar.url/twitch.png"),
          });
        }
        if (typeof url === "string" && url.includes("kick.com/api/v2/channels")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ user: { profile_pic: "https://avatar.url/kick.png" } }),
          });
        }
        if (typeof url === "string" && url.includes("kick.com/api/v1/channels")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ user_id: 12345 }),
          });
        }
        return Promise.resolve({
          ok: false,
          text: () => Promise.resolve(""),
          json: () => Promise.resolve({}),
        });
      })
    );
  });

  afterEach(() => {
    scope.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("UNIFIED_CHAT_ID is a stable constant string", () => {
    // Arrange + Act + Assert
    expect(typeof UNIFIED_CHAT_ID).toBe("string");
    expect(UNIFIED_CHAT_ID.length).toBeGreaterThan(0);
  });

  it("initialises and hydrates messages from twitch_get_messages", async () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;

    // Act
    scope.run(() => {
      chat = useUnifiedChat();
    });
    await vi.runAllTimersAsync();

    // Assert
    expect(chat.messages.value).toHaveLength(1);
    expect(chat.messages.value[0]?.id).toBe("m1");
    expect(chat.connectionState.value).toBe("connected");
  });

  it("handles twitch_get_messages error gracefully", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === "twitch_get_messages") {
        return Promise.reject(new Error("Failed to load history"));
      }
      if (cmd === "twitch_get_connection_state") {
        return Promise.resolve({ state: "connected" });
      }
      return Promise.resolve([]);
    });

    let chat!: ReturnType<typeof useUnifiedChat>;

    // Act
    scope.run(() => {
      chat = useUnifiedChat();
    });
    await vi.runAllTimersAsync();

    // Assert
    expect(chat.messages.value).toEqual([]);
  });

  it("handles twitch_get_connection_state failure fallback", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === "twitch_get_connection_state") {
        return Promise.reject(new Error("IPC failure"));
      }
      return Promise.resolve([]);
    });

    let chat!: ReturnType<typeof useUnifiedChat>;

    // Act
    scope.run(() => {
      chat = useUnifiedChat();
    });
    await vi.runAllTimersAsync();

    // Assert
    expect(chat.connectionState.value).toBe("disconnected");
  });

  it("twitchChannels and kickChannels filter streams correctly", () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;

    // Act
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Assert
    expect(chat.twitchChannels.value).toEqual(["gaules", "cellbit"]);
    expect(chat.kickChannels.value).toEqual(["somekick"]);
  });

  it("channelColor returns deterministic hex color for channels", () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Act
    const color1 = chat.channelColor("gaules");
    const color2 = chat.channelColor("gaules");

    // Assert
    expect(color1).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(color1).toBe(color2);
  });

  it("channelColor assigns unique colors from palette when available", () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Act
    const c1 = chat.channelColor("chan1");
    const c2 = chat.channelColor("chan2");

    // Assert
    expect(c1).not.toBe(c2);
  });

  it("sendMessage invokes twitch_send_message when authenticated", async () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Act
    await chat.sendMessage("gaules", "Hello Twitch");

    // Assert
    expect(invoke).toHaveBeenCalledWith("twitch_send_message", {
      channel: "gaules",
      text: "Hello Twitch",
    });
  });

  it("sendMessage re-throws error on invoke failure", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === "twitch_send_message") {
        return Promise.reject(new Error("Send failed"));
      }
      return Promise.resolve([]);
    });

    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Act & Assert
    await expect(chat.sendMessage("gaules", "fail")).rejects.toThrow("Send failed");
  });

  it("sendMessage does nothing if not authenticated", async () => {
    // Arrange
    mockAuth.value = false;
    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Act
    await chat.sendMessage("gaules", "Hello");

    // Assert
    expect(invoke).not.toHaveBeenCalledWith("twitch_send_message", expect.anything());
  });

  it("sendKickMessage fetches user_id and invokes kick_send_message", async () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Act
    await chat.sendKickMessage("somekick", "Hello Kick");

    // Assert
    expect(invoke).toHaveBeenCalledWith("kick_send_message", {
      broadcasterUserId: 12345,
      message: "Hello Kick",
    });
  });

  it("sendKickMessage throws error when channel fetch fails", async () => {
    // Arrange
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );

    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Act & Assert
    await expect(chat.sendKickMessage("unknownkick", "Hello")).rejects.toThrow(
      "Channel fetch failed: 404"
    );
  });

  it("handles incoming unified-chat-message events and updates batch", async () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });
    await vi.runAllTimersAsync();

    // Act
    const listener = listenerCallbacks["unified-chat-message"];
    expect(listener).toBeDefined();

    listener?.({
      payload: {
        id: "msg-2",
        channel: "gaules",
        username: "chatuser",
        display_name: "ChatUser",
        message: "teste",
        timestamp_ms: 2000,
        color: "#fff",
        badges: [],
        emotes: null,
      },
    });

    vi.advanceTimersByTime(60);

    // Assert
    expect(chat.messages.value.length).toBe(2);
    expect(chat.messages.value[0]?.id).toBe("msg-2");
    expect(chat.channelMessagesMap.value["gaules"]).toBeDefined();
    expect(chat.channelMessagesMap.value["gaules"]![0]?.id).toBe("msg-2");
  });

  it("handles local pending messages and removes isPending after timeout", async () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });
    await vi.runAllTimersAsync();

    // Act
    const listener = listenerCallbacks["unified-chat-message"];
    listener?.({
      payload: {
        id: "local-123",
        channel: "gaules",
        username: "testuser",
        display_name: "TestUser",
        message: "pending text",
        timestamp_ms: 3000,
        color: null,
        badges: [],
        emotes: null,
      },
    });

    vi.advanceTimersByTime(60);

    // Assert pending state
    expect(chat.messages.value[0]?.isPending).toBe(true);

    // Act: Advance past 1000ms timeout
    vi.advanceTimersByTime(1000);

    // Assert cleared pending state
    expect(chat.messages.value[0]?.isPending).toBe(false);
  });

  it("handles kick-chat-message event and de-duplicates matching pending message", async () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });
    await vi.runAllTimersAsync();

    // 1. Push a local pending Kick message
    const kickListener = listenerCallbacks["kick-chat-message"];
    kickListener?.({
      payload: {
        id: "local-kick-100",
        channel: "somekick",
        username: "kickuser",
        display_name: "KickUser",
        message: "pending kick msg",
        timestamp_ms: 4000,
        color: null,
        badges: [],
        emotes: null,
      },
    });
    vi.advanceTimersByTime(60);
    expect(chat.messages.value[0]?.isPending).toBe(true);

    // 2. Receive real Kick message matching the pending content
    kickListener?.({
      payload: {
        id: "real-kick-100",
        channel: "somekick",
        username: "kickuser",
        display_name: "KickUser",
        message: "pending kick msg",
        timestamp_ms: 4005,
        color: null,
        badges: [],
        emotes: null,
      },
    });
    vi.advanceTimersByTime(60);

    // Assert pending message was removed and real message replaces it
    expect(chat.messages.value.some((m) => m.id === "local-kick-100")).toBe(false);
    expect(chat.messages.value[0]?.id).toBe("real-kick-100");
  });

  it("removeLastLocalMessage removes pending Twitch message and returns text", async () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });
    await vi.runAllTimersAsync();

    const listener = listenerCallbacks["unified-chat-message"];
    listener?.({
      payload: {
        id: "local-456",
        channel: "gaules",
        username: "testuser",
        display_name: "TestUser",
        message: "rollback text",
        timestamp_ms: 4000,
        color: null,
        badges: [],
        emotes: null,
      },
    });
    vi.advanceTimersByTime(60);

    // Act
    const removedText = chat.removeLastLocalMessage("gaules", "testuser");

    // Assert
    expect(removedText).toBe("rollback text");
    expect(chat.messages.value.some((m) => m.id === "local-456")).toBe(false);
  });

  it("removeLastLocalMessage returns null if no pending message matches", () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Act
    const result = chat.removeLastLocalMessage("gaules", "unknown");

    // Assert
    expect(result).toBeNull();
  });

  it("removeLastLocalKickMessage removes pending Kick message and returns text", async () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });
    await vi.runAllTimersAsync();

    const listener = listenerCallbacks["kick-chat-message"];
    listener?.({
      payload: {
        id: "local-kick-789",
        channel: "somekick",
        username: "kickuser",
        display_name: "KickUser",
        message: "kick rollback text",
        timestamp_ms: 5000,
        color: null,
        badges: [],
        emotes: null,
      },
    });
    vi.advanceTimersByTime(60);

    // Act
    const removedText = chat.removeLastLocalKickMessage("somekick", "kickuser");

    // Assert
    expect(removedText).toBe("kick rollback text");
  });

  it("removeLastLocalKickMessage returns null if no pending message matches", () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Act
    const result = chat.removeLastLocalKickMessage("somekick", "unknown");

    // Assert
    expect(result).toBeNull();
  });

  it("handles twitch-connection-state and twitch-auth-expired events", async () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });
    await vi.runAllTimersAsync();

    // Act & Assert connection state update
    listenerCallbacks["twitch-connection-state"]?.({ payload: { state: "reconnecting" } });
    expect(chat.connectionState.value).toBe("reconnecting");

    // Act & Assert auth expired
    listenerCallbacks["twitch-auth-expired"]?.();
    expect(chat.connectionState.value).toBe("disconnected");
  });

  it("fetches avatars for twitch and kick channels via watchers", async () => {
    // Arrange
    let chat!: ReturnType<typeof useUnifiedChat>;

    // Act
    scope.run(() => {
      chat = useUnifiedChat();
    });
    await vi.runAllTimersAsync();

    // Assert
    expect(chat.channelAvatars["gaules"]).toBe("https://avatar.url/twitch.png");
    expect(chat.channelAvatars["somekick"]).toBe("https://avatar.url/kick.png");
  });

  it("syncs channels when authenticated status changes to true", async () => {
    // Arrange
    mockAuth.value = false;
    scope.run(() => {
      useUnifiedChat();
    });

    // Act
    mockAuth.value = true;
    await vi.runAllTimersAsync();

    // Assert
    expect(invoke).toHaveBeenCalledWith("twitch_set_channels", {
      channels: ["gaules", "cellbit"],
    });
  });

  it("cleans up unlisten listeners on scope dispose", async () => {
    // Arrange
    scope.run(() => {
      useUnifiedChat();
    });
    await vi.runAllTimersAsync();

    // Act
    scope.stop();

    // Assert
    expect(unlistenFns["unified-chat-message"]).toHaveBeenCalled();
    expect(unlistenFns["kick-chat-message"]).toHaveBeenCalled();
    expect(unlistenFns["twitch-connection-state"]).toHaveBeenCalled();
    expect(unlistenFns["twitch-auth-expired"]).toHaveBeenCalled();
  });

  it("does not run init when isTauri is false", async () => {
    // Arrange
    mockIsTauri.value = false;
    let chat!: ReturnType<typeof useUnifiedChat>;

    // Act
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Assert
    expect(listen).not.toHaveBeenCalled();
    expect(chat.messages.value).toEqual([]);
  });
});

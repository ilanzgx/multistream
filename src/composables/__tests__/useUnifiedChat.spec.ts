import { effectScope, type EffectScope, ref } from "vue";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UNIFIED_CHAT_ID } from "../useUnifiedChat";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("@/composables/useUpdater", () => ({
  isTauri: () => true,
}));

const mockStreams = ref([
  { id: "1", channel: "gaules", platform: "twitch" },
  { id: "2", channel: "cellbit", platform: "twitch" },
  { id: "3", channel: "somekick", platform: "kick" },
]);

vi.mock("@/composables/useStreams", () => ({
  useStreams: () => ({ streams: mockStreams }),
}));

vi.mock("@/composables/useTwitchAuth", () => ({
  useTwitchAuth: () => ({
    authenticated: ref(true),
    username: ref("testuser"),
    login: vi.fn(),
    logout: vi.fn(),
    loading: ref(false),
  }),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useUnifiedChat } from "../useUnifiedChat";

describe("useUnifiedChat", () => {
  let scope: EffectScope;

  beforeEach(() => {
    scope = effectScope();
    vi.clearAllMocks();
    mockStreams.value = [
      { id: "1", channel: "gaules", platform: "twitch" },
      { id: "2", channel: "cellbit", platform: "twitch" },
      { id: "3", channel: "somekick", platform: "kick" },
    ];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listen as ReturnType<typeof vi.fn>).mockResolvedValue(vi.fn());
  });

  afterEach(() => {
    scope.stop();
  });

  it("UNIFIED_CHAT_ID is a stable constant string", () => {
    // Arrange + Act + Assert
    expect(typeof UNIFIED_CHAT_ID).toBe("string");
    expect(UNIFIED_CHAT_ID.length).toBeGreaterThan(0);
  });

  it("initialises with empty messages", () => {
    // Arrange + Act
    let chat: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Assert
    expect(chat!.messages.value).toHaveLength(0);
  });

  it("initialises with disconnected state", () => {
    // Arrange + Act
    let chat: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Assert
    expect(chat!.connectionState.value).toBe("disconnected");
  });

  it("twitchChannels only includes twitch platform streams", () => {
    // Arrange + Act
    let chat: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Assert
    expect(chat!.twitchChannels.value).toContain("gaules");
    expect(chat!.twitchChannels.value).toContain("cellbit");
    expect(chat!.twitchChannels.value).not.toContain("somekick");
  });

  it("channelColor returns a valid hex colour", () => {
    // Arrange + Act
    let chat: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });
    const color = chat!.channelColor("gaules");

    // Assert
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("channelColor is deterministic for the same channel", () => {
    // Arrange
    let chat: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Act
    const c1 = chat!.channelColor("gaules");
    const c2 = chat!.channelColor("gaules");

    // Assert
    expect(c1).toBe(c2);
  });

  it("channelColor differs for different channels (probabilistic)", () => {
    // Arrange
    let chat: ReturnType<typeof useUnifiedChat>;
    scope.run(() => {
      chat = useUnifiedChat();
    });

    // Act
    const colors = new Set(
      ["gaules", "cellbit", "alanzoka", "mch", "loud_coringa", "jukes"].map((c) =>
        chat!.channelColor(c)
      )
    );

    // Assert — expect at least 2 distinct colours across 6 channels
    expect(colors.size).toBeGreaterThan(1);
  });
});

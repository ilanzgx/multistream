import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useLiveStatus } from "../useLiveStatus";
import { ref, effectScope, EffectScope } from "vue";

// module-level refs so tests can populate them before startPolling
const mockRecents = ref<any[]>([]);

vi.mock("../useRecents", () => ({
  useRecents: () => ({
    recents: mockRecents,
  }),
}));

vi.mock("../useFavorites", () => ({
  useFavorites: () => ({
    favorites: ref([]),
  }),
}));

vi.mock("../usePreferences", () => ({
  usePreferences: () => ({
    notificationsEnabled: ref(false),
  }),
}));

vi.mock("@/i18n", () => ({
  i18n: {
    global: {
      t: (key: string) => key,
    },
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(true),
}));

describe("useLiveStatus composable unit tests (Critical Paths)", () => {
  let scope: EffectScope;
  let sut: ReturnType<typeof useLiveStatus>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockRecents.value = [];

    scope = effectScope();
    sut = scope.run(() => useLiveStatus())!;
    sut.stopPolling();
    sut.statuses.value = {}; // Reset state
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Initial State", () => {
    it("should initialize with default states", () => {
      expect(sut.isChecking.value).toBe(false);
      expect(sut.isLoadingSuggestions.value).toBe(false);
      expect(Object.keys(sut.statuses.value).length).toBe(0);
      expect(sut.suggestedStreams.value.length).toBe(0);
    });
  });

  describe("getStatus()", () => {
    it("should retrieve correctly the status for registered streams", () => {
      // Arrange
      sut.statuses.value["twitch:gaules"] = {
        isLive: true,
        viewerCount: 45000,
      };
      sut.statuses.value["kick:alanzoka"] = { isLive: false };

      // Act & Assert
      expect(sut.getStatus("gaules", "twitch")).toEqual({
        isLive: true,
        viewerCount: 45000,
      });
      expect(sut.getStatus("alanzoka", "kick")).toEqual({ isLive: false });
    });

    it("should handle case-insensitivity on channel names", () => {
      // Arrange
      sut.statuses.value["twitch:ninja"] = { isLive: true };

      // Act & Assert
      expect(sut.getStatus("NINJA", "twitch")).toEqual({ isLive: true });
      expect(sut.getStatus("NiNjA", "twitch")).toEqual({ isLive: true });
    });

    it("should return null for non-existent channels or unsupported platforms", () => {
      // Assert
      expect(sut.getStatus("unknown", "twitch")).toBeNull();
      expect(sut.getStatus("gaules", "youtube" as any)).toBeNull();
    });
  });

  describe("Polling Controls", () => {
    it("should not start polling when there are no channels to track", () => {
      // Arrange
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

      // Act
      sut.startPolling();

      // Assert - should skip because no channels
      expect(setIntervalSpy).toHaveBeenCalledTimes(0);
    });

    it("should start interval polling without duplicating existing ones", () => {
      // Arrange - add a channel so startPolling actually starts
      mockRecents.value = [{ channel: "gaules", platform: "twitch", addedAt: Date.now() }];
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

      // Act
      sut.startPolling();
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);

      // Try to start again (should not trigger a new interval)
      sut.startPolling();
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    });

    it("should safely stop polling and clear the interval id", () => {
      // Arrange - add a channel so startPolling actually starts
      mockRecents.value = [{ channel: "gaules", platform: "twitch", addedAt: Date.now() }];
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

      // Arrange (start first)
      sut.startPolling();

      // Act
      sut.stopPolling();
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

      // Multiple stops should be safe
      sut.stopPolling();
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1); // Didn't increase
    });

    it("should clean up intervals on scope dispose", () => {
      // Arrange
      mockRecents.value = [{ channel: "gaules", platform: "twitch", addedAt: Date.now() }];
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

      const scope = effectScope();
      scope.run(() => {
        const localSut = useLiveStatus();
        localSut.startPolling();
      });

      // Act
      scope.stop(); // triggers onScopeDispose

      // Assert
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe("checkAll (Early return)", () => {
    it("should return early and clean statuses if no channels are available from favorites/recents", async () => {
      // Arrange
      sut.statuses.value["twitch:dead_stream"] = { isLive: true }; // Old status

      // Act
      await sut.checkAll();

      // Assert
      expect(sut.isChecking.value).toBe(false);
      expect(Object.keys(sut.statuses.value).length).toBe(0);
    });
  });

  describe("Fetching Behavior", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it("should call twitch and kick APIs and update statuses", async () => {
      mockRecents.value = [
        { channel: "gaules", platform: "twitch" },
        { channel: "alanzoka", platform: "kick" },
        { channel: "offline_kick", platform: "kick" },
      ];

      fetchSpy.mockImplementation(async (url: string | Request | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes("twitch.tv/gql")) {
          return {
            ok: true,
            json: async () => ({
              data: {
                c0: {
                  stream: {
                    title: "TRIBOMINERA",
                    viewersCount: 50000,
                    game: { displayName: "CS:GO" },
                  },
                },
              },
            }),
          };
        }
        if (urlStr.includes("kick.com/api/v2/channels/alanzoka")) {
          return {
            ok: true,
            json: async () => ({
              livestream: {
                session_title: "Jogando",
                viewer_count: 30000,
                categories: [{ name: "Horror" }],
              },
            }),
          };
        }
        if (urlStr.includes("offline_kick")) {
          return { ok: false, status: 404 };
        }
        return { ok: false };
      });

      await sut.checkAll();

      expect(sut.statuses.value["twitch:gaules"]).toEqual({
        isLive: true,
        title: "TRIBOMINERA",
        viewerCount: 50000,
        category: "CS:GO",
        thumbnailUrl: "https://static-cdn.jtvnw.net/previews-ttv/live_user_gaules-320x180.jpg",
      });

      expect(sut.statuses.value["kick:alanzoka"]).toEqual({
        isLive: true,
        title: "Jogando",
        viewerCount: 30000,
        category: "Horror",
      });

      expect(sut.statuses.value["kick:offline_kick"]).toEqual({
        isLive: false,
      });
    });

    it("should gracefully handle API failures", async () => {
      mockRecents.value = [
        { channel: "mch", platform: "twitch" },
        { channel: "coringa", platform: "kick" },
      ];

      fetchSpy.mockImplementation(async () => {
        return { ok: false, status: 500 };
      });

      await sut.checkAll();

      expect(Object.keys(sut.statuses.value).length).toBe(0);
    });
  });

  describe("refreshSuggestions", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it("should fetch suggestions from both platforms and interleave them, including phase 2", async () => {
      // Arrange
      let twitchCallCount = 0;
      fetchSpy.mockImplementation(async (url: string | Request | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes("twitch.tv")) {
          twitchCallCount++;
          // First call returns 30 items to trigger Phase 2. Second call returns 1 item.
          const edgeCount = twitchCallCount === 1 ? 30 : 1;
          return {
            ok: true,
            json: async () => ({
              data: {
                streams: {
                  edges: Array.from({ length: edgeCount }).map((_, i) => ({
                    cursor: `cursor_${i}`,
                    node: {
                      broadcaster: { login: `shroud_${twitchCallCount}_${i}` },
                      title: "Valo",
                      viewersCount: 10000 - i,
                      game: { displayName: "Valorant" },
                    },
                  })),
                },
              },
            }),
          };
        }
        if (urlStr.includes("featured-livestreams")) {
          return {
            ok: true,
            json: async () => ({
              data: [
                {
                  slug: "xqc",
                  session_title: "Reacts",
                  viewers: 15000,
                  categories: [{ name: "Just Chatting" }],
                },
              ],
            }),
          };
        }
        return { ok: false };
      });

      // Act
      await sut.refreshSuggestions();

      // Assert
      expect(sut.suggestedStreams.value.length).toBeGreaterThan(0);
      expect(sut.suggestedStreams.value[0]?.platform).toBe("twitch");
      expect(sut.suggestedStreams.value[1]?.platform).toBe("kick");
      // Verify Phase 2 background fetch happened (twitch called more than once)
      expect(twitchCallCount).toBeGreaterThan(1);
    });
  });

  describe("fetchStreamsForCategory", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it("should fetch from both platforms and interleave results for a category", async () => {
      // Arrange
      fetchSpy.mockImplementation(async (url: string | Request | URL, options?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes("twitch.tv/gql")) {
          const bodyStr = typeof options?.body === "string" ? options.body : "";
          if (bodyStr.includes("searchCategories")) {
            return {
              ok: true,
              json: async () => ({
                data: {
                  searchCategories: { edges: [{ node: { slug: "valorant" } }] },
                },
              }),
            };
          } else {
            return {
              ok: true,
              json: async () => ({
                data: {
                  game: {
                    streams: {
                      edges: [
                        {
                          node: {
                            broadcaster: { login: "shroud" },
                            title: "Valo",
                            viewersCount: 10000,
                            game: { displayName: "Valorant" },
                          },
                        },
                      ],
                    },
                  },
                },
              }),
            };
          }
        }
        if (urlStr.includes("featured-livestreams")) {
          return {
            ok: true,
            json: async () => ({
              data: [
                {
                  slug: "xqc",
                  session_title: "Reacts",
                  viewers: 15000,
                  categories: [{ name: "Valorant" }],
                },
              ],
            }),
          };
        }
        return { ok: false };
      });

      // Act
      const results = await sut.fetchStreamsForCategory("Valorant");

      // Assert
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.platform).toBe("twitch");
      expect(results[0]?.channel).toBe("shroud");
      expect(results[1]?.platform).toBe("kick");
      expect(results[1]?.channel).toBe("xqc");
    });
  });
});

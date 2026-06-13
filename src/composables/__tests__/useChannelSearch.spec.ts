import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ref, nextTick } from "vue";
import { useChannelSearch } from "../useChannelSearch";

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

vi.mock("@/config/api", () => ({
  API_CONFIG: {
    twitch: {
      clientId: "test-client-id",
      gqlUrl: "https://gql.twitch.tv/gql",
    },
    kick: {
      apiBaseUrl: "https://kick.com/api/v2/channels",
    },
  },
}));

/** Helper: trigger watcher then flush the debounce and all promises */
async function flush() {
  await nextTick(); // let Vue flush the watchEffect
  vi.advanceTimersByTime(300); // fire the debounce timer
  await vi.runAllTimersAsync(); // drain timers and microtasks
  await nextTick(); // flush reactive updates
}

describe("useChannelSearch", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.useRealTimers();
    fetchSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe("Twitch search (searchFor GQL)", () => {
    it("should return live and offline channels from Twitch GQL", async () => {
      // Arrange
      const query = ref("xarola");
      const platform = ref<"twitch" | "kick">("twitch");

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            searchFor: {
              channels: {
                items: [
                  {
                    login: "xarola_",
                    stream: { viewersCount: 1544, game: { displayName: "Rust" } },
                  },
                  {
                    login: "carola_tv",
                    stream: null,
                  },
                ],
              },
            },
          },
        }),
      } as any);

      // Act
      const { results, isLoading } = useChannelSearch(query, platform);
      await flush();

      // Assert
      expect(results.value).toHaveLength(2);
      expect(results.value[0]).toMatchObject({
        channel: "xarola_",
        platform: "twitch",
        isLive: true,
        category: "Rust",
      });
      expect(results.value[1]).toMatchObject({
        channel: "carola_tv",
        platform: "twitch",
        isLive: false,
      });
      expect(isLoading.value).toBe(false);
    });

    it("should cap results at SEARCH_LIMIT (5)", async () => {
      // Arrange
      const query = ref("test");
      const platform = ref<"twitch" | "kick">("twitch");

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            searchFor: {
              channels: {
                items: Array.from({ length: 10 }, (_, i) => ({
                  login: `user${i}`,
                  stream: null,
                })),
              },
            },
          },
        }),
      } as any);

      // Act
      const { results } = useChannelSearch(query, platform);
      await flush();

      // Assert
      expect(results.value).toHaveLength(5);
    });

    it("should return empty results on Twitch API failure", async () => {
      // Arrange
      const query = ref("anyone");
      const platform = ref<"twitch" | "kick">("twitch");

      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as any);

      // Act
      const { results, isLoading } = useChannelSearch(query, platform);
      await flush();

      // Assert
      expect(results.value).toHaveLength(0);
      expect(isLoading.value).toBe(false);
    });

    it("should return empty results on network error", async () => {
      // Arrange
      const query = ref("crash");
      const platform = ref<"twitch" | "kick">("twitch");

      fetchSpy.mockRejectedValue(new Error("Network error"));

      // Act
      const { results, isLoading } = useChannelSearch(query, platform);
      await flush();

      // Assert
      expect(results.value).toHaveLength(0);
      expect(isLoading.value).toBe(false);
    });
  });

  describe("Kick search (direct slug lookup)", () => {
    it("should return a live channel when slug resolves", async () => {
      // Arrange
      const query = ref("xarola");
      const platform = ref<"twitch" | "kick">("kick");

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          slug: "xarola",
          livestream: { categories: [{ name: "Just Chatting" }] },
        }),
      } as any);

      // Act
      const { results, isLoading } = useChannelSearch(query, platform);
      await flush();

      // Assert
      expect(results.value).toHaveLength(1);
      expect(results.value[0]).toMatchObject({
        channel: "xarola",
        platform: "kick",
        isLive: true,
        category: "Just Chatting",
      });
      expect(isLoading.value).toBe(false);
    });

    it("should return offline channel when slug resolves but no stream", async () => {
      // Arrange
      const query = ref("xarola");
      const platform = ref<"twitch" | "kick">("kick");

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ slug: "xarola", livestream: null }),
      } as any);

      // Act
      const { results } = useChannelSearch(query, platform);
      await flush();

      // Assert
      expect(results.value).toHaveLength(1);
      expect(results.value[0]).toMatchObject({
        channel: "xarola",
        platform: "kick",
        isLive: false,
      });
    });

    it("should return empty array on 404 (channel does not exist)", async () => {
      // Arrange
      const query = ref("doesnotexist99999");
      const platform = ref<"twitch" | "kick">("kick");

      fetchSpy.mockResolvedValue({ ok: false, status: 404 } as any);

      // Act
      const { results } = useChannelSearch(query, platform);
      await flush();

      // Assert
      expect(results.value).toHaveLength(0);
    });

    it("should return empty results on non-404 API failure", async () => {
      // Arrange
      const query = ref("anyone");
      const platform = ref<"twitch" | "kick">("kick");

      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as any);

      // Act
      const { results } = useChannelSearch(query, platform);
      await flush();

      // Assert
      expect(results.value).toHaveLength(0);
    });
  });

  describe("Debounce behavior", () => {
    it("should only fire one request per burst of keystrokes", async () => {
      // Arrange
      const query = ref("g");
      const platform = ref<"twitch" | "kick">("twitch");

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { searchFor: { channels: { items: [] } } } }),
      } as any);

      // Act
      useChannelSearch(query, platform);

      // Simulate rapid typing within debounce window
      await nextTick();
      query.value = "ga";
      await nextTick();
      query.value = "gau";
      await nextTick();
      query.value = "gaul";
      await nextTick();

      // Advance past debounce — only final value's timer survives
      vi.advanceTimersByTime(300);
      await vi.runAllTimersAsync();
      await nextTick();

      // Assert
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("clear()", () => {
    it("should clear results and stop loading", async () => {
      // Arrange
      const query = ref("xarola");
      const platform = ref<"twitch" | "kick">("twitch");

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            searchFor: {
              channels: { items: [{ login: "xarola_", stream: null }] },
            },
          },
        }),
      } as any);

      const { results, isLoading, clear } = useChannelSearch(query, platform);
      await flush();
      expect(results.value).toHaveLength(1);

      // Act
      clear();
      await nextTick();

      // Assert
      expect(results.value).toHaveLength(0);
      expect(isLoading.value).toBe(false);
    });
  });

  describe("Platform change", () => {
    it("should clear results when platform changes", async () => {
      // Arrange
      const query = ref("xqc");
      const platform = ref<"twitch" | "kick">("twitch");

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            searchFor: {
              channels: {
                items: [{ login: "xqc", stream: { viewersCount: 100, game: null } }],
              },
            },
          },
        }),
      } as any);

      const { results } = useChannelSearch(query, platform);
      await flush();
      expect(results.value).toHaveLength(1);

      // Act
      platform.value = "kick";
      await nextTick();

      // Assert
      expect(results.value).toHaveLength(0);
    });
  });

  describe("Empty query and unsupported platforms", () => {
    it("should not fire a request when query is empty", async () => {
      // Arrange
      const query = ref("");
      const platform = ref<"twitch" | "kick">("twitch");

      // Act
      useChannelSearch(query, platform);
      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      // Assert
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should not fire a request for unsupported platforms", async () => {
      // Arrange
      const query = ref("test");
      const platform = ref<any>("youtube");

      // Act
      useChannelSearch(query, platform);
      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      // Assert
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

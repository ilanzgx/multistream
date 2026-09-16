import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ref, nextTick } from "vue";
import { useChannelSearch } from "../useChannelSearch";

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
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

const mockFavorites = ref<any[]>([]);
const mockRecents = ref<any[]>([]);
const mockSuggestedStreams = ref<any[]>([]);
const mockGetStatus = vi.fn();

vi.mock("../useFavorites", () => ({
  useFavorites: () => ({
    favorites: mockFavorites,
  }),
}));

vi.mock("../useRecents", () => ({
  useRecents: () => ({
    recents: mockRecents,
  }),
}));

vi.mock("../useLiveStatus", () => ({
  useLiveStatus: () => ({
    suggestedStreams: mockSuggestedStreams,
    getStatus: mockGetStatus,
  }),
}));

/** Helper: trigger watcher then flush the debounce and all promises */
async function flush() {
  await nextTick();
  vi.advanceTimersByTime(300);
  await vi.runAllTimersAsync();
  await nextTick();
}

describe("useChannelSearch", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let sut: ReturnType<typeof useChannelSearch>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.spyOn(globalThis, "fetch");
    mockFavorites.value = [];
    mockRecents.value = [];
    mockSuggestedStreams.value = [];
    mockGetStatus.mockReturnValue(null);
    mockInvoke.mockResolvedValue([]);
    sut = useChannelSearch();
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
      const platform = ref<"twitch" | "kick" | "youtube">("twitch");

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
      const { results, isLoading } = sut.search(query, platform);
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
      const platform = ref<"twitch" | "kick" | "youtube">("twitch");

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
      const { results } = sut.search(query, platform);
      await flush();

      // Assert
      expect(results.value).toHaveLength(5);
    });

    it("should return empty results on Twitch API failure", async () => {
      // Arrange
      const query = ref("anyone");
      const platform = ref<"twitch" | "kick" | "youtube">("twitch");

      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as any);

      // Act
      const { results, isLoading } = sut.search(query, platform);
      await flush();

      // Assert
      expect(results.value).toHaveLength(0);
      expect(isLoading.value).toBe(false);
    });

    it("should return empty results on network error", async () => {
      // Arrange
      const query = ref("crash");
      const platform = ref<"twitch" | "kick" | "youtube">("twitch");

      fetchSpy.mockRejectedValue(new Error("Network error"));

      // Act
      const { results, isLoading } = sut.search(query, platform);
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
      const platform = ref<"twitch" | "kick" | "youtube">("kick");

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          slug: "xarola",
          livestream: { categories: [{ name: "Just Chatting" }] },
        }),
      } as any);

      // Act
      const { results, isLoading } = sut.search(query, platform);
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
      const platform = ref<"twitch" | "kick" | "youtube">("kick");

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ slug: "xarola", livestream: null }),
      } as any);

      // Act
      const { results } = sut.search(query, platform);
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
      const platform = ref<"twitch" | "kick" | "youtube">("kick");

      fetchSpy.mockResolvedValue({ ok: false, status: 404 } as any);

      // Act
      const { results } = sut.search(query, platform);
      await flush();

      // Assert
      expect(results.value).toHaveLength(0);
    });

    it("should return empty results on non-404 API failure", async () => {
      // Arrange
      const query = ref("anyone");
      const platform = ref<"twitch" | "kick" | "youtube">("kick");

      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as any);

      // Act
      const { results } = sut.search(query, platform);
      await flush();

      // Assert
      expect(results.value).toHaveLength(0);
    });
  });

  describe("YouTube search & local matching", () => {
    it("should match local YouTube favorites and recents", async () => {
      // Arrange
      mockFavorites.value = [
        { channel: "batzera1", platform: "youtube", displayName: "batzera" },
        { channel: "gaules", platform: "twitch" },
      ];
      mockRecents.value = [{ channel: "alanzoka", platform: "youtube" }];
      mockGetStatus.mockImplementation((channel) => {
        if (channel === "batzera1" || channel === "batzera") {
          return { isLive: true, category: "Gaming" };
        }
        return null;
      });

      const query = ref("bat");
      const platform = ref<"twitch" | "kick" | "youtube">("youtube");

      // Act
      const { results } = sut.search(query, platform);
      await flush();

      // Assert
      expect(results.value).toHaveLength(1);
      expect(results.value[0]).toMatchObject({
        channel: "batzera",
        platform: "youtube",
        isLive: true,
        category: "Gaming",
      });
    });

    it("should return typed query as direct candidate when not in local favorites", async () => {
      // Arrange
      const query = ref("@newchannel");
      const platform = ref<"twitch" | "kick" | "youtube">("youtube");

      // Act
      const { results } = sut.search(query, platform);
      await flush();

      // Assert
      expect(results.value).toHaveLength(1);
      expect(results.value[0]).toMatchObject({
        channel: "newchannel",
        platform: "youtube",
        isLive: false,
      });
    });

    it("should call youtube_search_channels and map display_name + handle", async () => {
      // Arrange
      mockInvoke.mockResolvedValueOnce([
        {
          channel: "batzera1",
          display_name: "Batzera",
          is_live: true,
          category: "150 mil inscritos",
        },
        {
          channel: "batzera2",
          display_name: "Batzera Fan",
          is_live: false,
          category: "10 mil inscritos",
        },
      ]);

      const query = ref("batzera");
      const platform = ref<"twitch" | "kick" | "youtube">("youtube");

      // Act
      const { results } = sut.search(query, platform);
      await flush();

      // Assert
      expect(mockInvoke).toHaveBeenCalledWith("youtube_search_channels", { query: "batzera" });
      expect(results.value).toHaveLength(2);
      expect(results.value[0]).toMatchObject({
        channel: "Batzera",
        handle: "batzera1",
        platform: "youtube",
        isLive: true,
        category: "150 mil inscritos",
      });
      expect(results.value[1]).toMatchObject({
        channel: "Batzera Fan",
        handle: "batzera2",
        platform: "youtube",
        isLive: false,
      });
    });

    it("should deduplicate local favorites against remote YouTube results", async () => {
      // Arrange
      mockFavorites.value = [{ channel: "batzera1", platform: "youtube", displayName: "Batzera" }];
      mockInvoke.mockResolvedValueOnce([
        { channel: "batzera1", display_name: "Batzera", is_live: true, category: "Gaming" },
        { channel: "batzera2", display_name: "Batzera Fan", is_live: false },
      ]);

      const query = ref("batzera");
      const platform = ref<"twitch" | "kick" | "youtube">("youtube");

      // Act
      const { results } = sut.search(query, platform);
      await flush();

      // Assert — batzera1 from favorites + batzera2 from remote, no duplicate batzera1
      expect(results.value).toHaveLength(2);
      const handles = results.value.map((r) => r.handle ?? r.channel);
      expect(handles).toEqual(["batzera1", "batzera2"]);
      const channels = results.value.map((r) => r.channel);
      expect(channels).toEqual(["Batzera", "Batzera Fan"]);
    });
  });

  describe("Debounce behavior", () => {
    it("should only fire one request per burst of keystrokes", async () => {
      // Arrange
      const query = ref("g");
      const platform = ref<"twitch" | "kick" | "youtube">("twitch");

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { searchFor: { channels: { items: [] } } } }),
      } as any);

      // Act
      sut.search(query, platform);

      await nextTick();
      query.value = "ga";
      await nextTick();
      query.value = "gau";
      await nextTick();
      query.value = "gaul";
      await nextTick();

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
      const platform = ref<"twitch" | "kick" | "youtube">("twitch");

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

      const { results, isLoading, clear } = sut.search(query, platform);
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
      const platform = ref<"twitch" | "kick" | "youtube">("twitch");

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

      const { results } = sut.search(query, platform);
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
      const platform = ref<"twitch" | "kick" | "youtube">("twitch");

      // Act
      sut.search(query, platform);
      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      // Assert
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should not fire a request for unsupported platforms", async () => {
      // Arrange
      const query = ref("test");
      const platform = ref<any>("custom");

      // Act
      sut.search(query, platform);
      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      // Assert
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

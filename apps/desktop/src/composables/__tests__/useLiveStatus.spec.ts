import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useLiveStatus } from "../useLiveStatus";
import { ref, effectScope, type EffectScope } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "../useToast";

// Module-level refs so tests can populate them before startPolling
const mockRecents = ref<any[]>([]);
const mockFavorites = ref<any[]>([]);
const mockNotificationsEnabled = ref(false);
const mockVisibility = ref<"visible" | "hidden">("visible");
const mockAddStream = vi.fn();
const mockStreams = ref<any[]>([]);
const mockIsTauri = vi.fn(() => false);

vi.mock("../useRecents", () => ({
  useRecents: () => ({
    recents: mockRecents,
  }),
}));

vi.mock("../useFavorites", () => ({
  useFavorites: () => ({
    favorites: mockFavorites,
  }),
}));

vi.mock("../usePreferences", () => ({
  usePreferences: () => ({
    notificationsEnabled: mockNotificationsEnabled,
  }),
}));

vi.mock("../useStreams", () => ({
  useStreams: () => ({
    addStream: mockAddStream,
    streams: mockStreams,
  }),
}));

vi.mock("../useToast", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@vueuse/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vueuse/core")>();
  return {
    ...actual,
    useDocumentVisibility: () => mockVisibility,
    createSharedComposable: (fn: any) => fn,
  };
});

vi.mock("@/lib/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http")>();
  return {
    ...actual,
    isTauri: () => mockIsTauri(),
  };
});

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: any) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));

vi.mock("@/i18n", () => ({
  i18n: {
    global: {
      t: (key: string, params?: any) => (params ? `${key}:${JSON.stringify(params)}` : key),
    },
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

describe("useLiveStatus composable unit tests (Critical Paths)", () => {
  let scope: EffectScope;
  let sut: ReturnType<typeof useLiveStatus>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockRecents.value = [];
    mockFavorites.value = [];
    mockStreams.value = [];
    mockNotificationsEnabled.value = false;
    mockVisibility.value = "visible";
    mockIsTauri.mockReturnValue(false);

    scope = effectScope();
    sut = scope.run(() => useLiveStatus())!;
    sut.stopPolling();
    sut.statuses.value = {};
  });

  afterEach(() => {
    scope.stop();
    vi.useRealTimers();
  });

  describe("Initial State", () => {
    it("should initialize with default states", () => {
      // Arrange & Act & Assert
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
      // Arrange & Act & Assert
      expect(sut.getStatus("unknown", "twitch")).toBeNull();
      expect(sut.getStatus("gaules", "custom" as any)).toBeNull();
      expect(sut.getStatus("gaules", "youtube" as any)).toBeNull();
    });
  });

  describe("Polling Controls", () => {
    it("should not start polling when there are no channels to track", () => {
      // Arrange
      mockRecents.value = [];
      mockFavorites.value = [];

      // Act
      sut.startPolling();

      // Assert
      expect(sut.isChecking.value).toBe(false);
    });

    it("should start interval polling without duplicating existing ones", async () => {
      // Arrange
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ data: { c0: { stream: { viewersCount: 100 } } } }),
      } as Response);

      mockFavorites.value = [{ channel: "gaules", platform: "twitch" }];
      await vi.advanceTimersByTimeAsync(1100);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Act
      sut.startPolling(); // duplicate call since watcher already started it
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Fast-forward interval
      await vi.advanceTimersByTimeAsync(30000);

      // Assert
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
    });

    it("should safely stop polling and clear the interval id", async () => {
      // Arrange
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ data: { c0: { stream: { viewersCount: 100 } } } }),
      } as Response);

      mockFavorites.value = [{ channel: "gaules", platform: "twitch" }];
      await vi.advanceTimersByTimeAsync(1100);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Act
      sut.stopPolling();
      sut.stopPolling(); // safe multiple calls

      await vi.advanceTimersByTimeAsync(60000);

      // Assert
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockRestore();
    });

    it("should clean up intervals on scope dispose", async () => {
      // Arrange
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ data: { c0: { stream: { viewersCount: 100 } } } }),
      } as Response);

      mockFavorites.value = [{ channel: "gaules", platform: "twitch" }];
      await vi.advanceTimersByTimeAsync(1100);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Act
      scope.stop();
      await vi.advanceTimersByTimeAsync(60000);

      // Assert
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockRestore();
    });

    it("should start suggestions polling interval and refresh periodically when streams are empty", async () => {
      // Arrange
      mockStreams.value = [];
      expect(sut.lastSuggestionsFetch.value).toBe(0);
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { user: null, users: [], streams: { edges: [] } },
        }),
      } as Response);

      // Act
      sut.startPolling();
      expect(sut.lastSuggestionsFetch.value).toBe(0);

      // Advance by 5 minutes (300,000ms)
      await vi.advanceTimersByTimeAsync(300000);

      // Assert
      expect(sut.lastSuggestionsFetch.value).toBeGreaterThan(0);

      fetchSpy.mockRestore();
    });

    it("should not auto-refresh suggestions when active streams are open", async () => {
      // Arrange
      mockStreams.value = [{ channel: "gaules", platform: "twitch" }];
      expect(sut.lastSuggestionsFetch.value).toBe(0);
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // Act
      sut.startPolling();
      await vi.advanceTimersByTimeAsync(300000);

      // Assert
      expect(sut.lastSuggestionsFetch.value).toBe(0);

      fetchSpy.mockRestore();
    });
  });

  describe("checkAll (Early return)", () => {
    it("should return early and clean statuses if no channels are available from favorites/recents", async () => {
      // Arrange
      sut.statuses.value["twitch:old"] = { isLive: true };
      mockRecents.value = [];
      mockFavorites.value = [];

      // Act
      await sut.checkAll();

      // Assert
      expect(Object.keys(sut.statuses.value).length).toBe(0);
      expect(sut.isChecking.value).toBe(false);
    });

    it("should not reset previousStatuses when all channels are removed (EC-14)", async () => {
      // Arrange
      mockFavorites.value = [{ channel: "streamer1", platform: "twitch" }];
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            c0: {
              profileImageURL: "https://example.com/avatar.png",
              stream: {
                title: "Live Stream",
                viewersCount: 1000,
                game: { displayName: "Game" },
              },
            },
          },
        }),
      } as Response);

      await sut.checkAll();
      expect(sut.getStatus("streamer1", "twitch")?.isLive).toBe(true);

      // Act
      mockFavorites.value = [];
      await sut.checkAll();

      // Assert
      expect(sut.statuses.value).toEqual({});

      fetchSpy.mockRestore();
    });

    it("should return early when app is hidden and notifications are disabled", async () => {
      // Arrange
      mockFavorites.value = [{ channel: "gaules", platform: "twitch" }];
      mockVisibility.value = "hidden";
      mockNotificationsEnabled.value = false;
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // Act
      await sut.checkAll();

      // Assert
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });
  });

  describe("Fetching Behavior", () => {
    it("should call twitch and kick APIs and update statuses", async () => {
      // Arrange
      mockFavorites.value = [
        { channel: "gaules", platform: "twitch" },
        { channel: "alanzoka", platform: "kick" },
      ];

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const urlStr = url.toString();
        if (urlStr.includes("twitch.tv")) {
          return {
            ok: true,
            json: async () => ({
              data: {
                c0: {
                  profileImageURL: "https://img.twitch/gaules.jpg",
                  stream: {
                    title: "Tribo",
                    viewersCount: 30000,
                    game: { displayName: "CS2" },
                  },
                },
              },
            }),
          } as Response;
        }
        if (urlStr.includes("kick.com")) {
          return {
            ok: true,
            json: async () => ({
              livestream: {
                session_title: "Jogando",
                viewer_count: 5000,
                categories: [{ name: "GTA V" }],
                thumbnail: { url: "https://img.kick/thumb.jpg" },
              },
              user: { profile_pic: "https://img.kick/alanzoka.jpg" },
            }),
          } as Response;
        }
        return { ok: false } as Response;
      });

      // Act
      await sut.checkAll();

      // Assert
      expect(sut.getStatus("gaules", "twitch")).toEqual({
        isLive: true,
        viewerCount: 30000,
        title: "Tribo",
        category: "CS2",
        avatarUrl: "https://img.twitch/gaules.jpg",
        thumbnailUrl: "https://static-cdn.jtvnw.net/previews-ttv/live_user_gaules-320x180.jpg",
      });

      expect(sut.getStatus("alanzoka", "kick")).toEqual({
        isLive: true,
        viewerCount: 5000,
        title: "Jogando",
        category: "GTA V",
        avatarUrl: "https://img.kick/alanzoka.jpg",
        thumbnailUrl: "https://img.kick/thumb.jpg",
      });

      fetchSpy.mockRestore();
    });

    it("should handle Kick 404 response as offline channel", async () => {
      // Arrange
      mockFavorites.value = [{ channel: "offline_user", platform: "kick" }];
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      // Act
      await sut.checkAll();

      // Assert
      expect(sut.getStatus("offline_user", "kick")).toEqual({ isLive: false });

      fetchSpy.mockRestore();
    });

    it("should gracefully handle API failures", async () => {
      // Arrange
      mockFavorites.value = [{ channel: "gaules", platform: "twitch" }];
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("Network connection error"));

      // Act
      const checkPromise = sut.checkAll();
      await vi.advanceTimersByTimeAsync(600);
      await checkPromise;

      // Assert
      expect(sut.isChecking.value).toBe(false);
      expect(sut.getStatus("gaules", "twitch")).toBeNull();

      fetchSpy.mockRestore();
    });

    it("should not update statuses when both APIs fail (notification bug fix)", async () => {
      // Arrange
      mockFavorites.value = [
        { channel: "gaules", platform: "twitch" },
        { channel: "alanzoka", platform: "kick" },
      ];
      sut.statuses.value = {
        "twitch:gaules": { isLive: true, viewerCount: 1000 },
        "kick:alanzoka": { isLive: true, viewerCount: 500 },
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      // Act
      const checkPromise = sut.checkAll();
      await vi.advanceTimersByTimeAsync(1000);
      await checkPromise;

      // Assert
      expect(sut.statuses.value["twitch:gaules"]?.isLive).toBe(true);
      expect(sut.statuses.value["kick:alanzoka"]?.isLive).toBe(true);

      fetchSpy.mockRestore();
    });

    it("should not fire spurious notifications when Twitch returns empty data.data (flaky network)", async () => {
      // Arrange
      mockFavorites.value = [{ channel: "gaules", platform: "twitch" }];
      sut.statuses.value = {
        "twitch:gaules": { isLive: true, viewerCount: 1000 },
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      } as Response);

      // Act
      await sut.checkAll();

      // Assert
      expect(sut.statuses.value["twitch:gaules"]?.isLive).toBe(true);

      fetchSpy.mockRestore();
    });

    it("should detect channel swaps even with the same channel count (EC-1/EC-10 watcher fix)", async () => {
      // Arrange
      mockFavorites.value = [{ channel: "streamer1", platform: "twitch" }];
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ data: { c0: { stream: { viewersCount: 100 } } } }),
      } as Response);

      await sut.checkAll();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Act: Swap channel (same count: 1 -> 1)
      mockFavorites.value = [{ channel: "streamer2", platform: "twitch" }];
      await vi.advanceTimersByTimeAsync(1100);

      // Assert
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
    });

    it("should escape channel names in GQL queries (EC-13 regression)", async () => {
      // Arrange
      mockFavorites.value = [{ channel: 'test"channel', platform: "twitch" }];
      let requestedBody = "";

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_, opts) => {
        requestedBody = opts?.body as string;
        return {
          ok: true,
          json: async () => ({ data: { c0: { stream: null } } }),
        } as Response;
      });

      // Act
      await sut.checkAll();

      // Assert
      const parsed = JSON.parse(requestedBody);
      expect(parsed.query).toContain('user(login: "test\\"channel")');

      fetchSpy.mockRestore();
    });
  });

  describe("Desktop Notifications", () => {
    beforeEach(() => {
      mockNotificationsEnabled.value = true;
      mockIsTauri.mockReturnValue(true);
    });

    it("should trigger a single welcome toast on first check when 1 favorite is live", async () => {
      // Arrange
      mockFavorites.value = [{ channel: "gaules", platform: "twitch" }];
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            c0: {
              profileImageURL: "https://avatar.png",
              stream: { title: "CS2", viewersCount: 1000, game: { displayName: "CS2" } },
            },
          },
        }),
      } as Response);

      // Act
      await sut.checkAll();

      // Assert
      expect(toast.info).toHaveBeenCalledTimes(1);
      const [title, options] = vi.mocked(toast.info).mock.calls[0]!;
      expect(title).toBe("notifications.welcome");
      expect((options as any)?.description).toContain("gaules");

      // Verify watch action button
      (options as any)?.action?.onClick();
      expect(mockAddStream).toHaveBeenCalledWith("gaules", "twitch");

      fetchSpy.mockRestore();
    });

    it("should trigger a welcome toast for 2 to 12 live favorites", async () => {
      // Arrange
      mockFavorites.value = [
        { channel: "streamer1", platform: "twitch" },
        { channel: "streamer2", platform: "twitch" },
      ];
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            c0: { stream: { title: "S1", viewersCount: 1000 } },
            c1: { stream: { title: "S2", viewersCount: 2000 } },
          },
        }),
      } as Response);

      // Act
      await sut.checkAll();

      // Assert
      expect(toast.info).toHaveBeenCalledTimes(1);
      const [, options] = vi.mocked(toast.info).mock.calls[0]!;
      expect((options as any)?.description).toContain("notifications.welcomeBody");

      fetchSpy.mockRestore();
    });

    it("should trigger a welcome toast with overflow count when more than 12 favorites are live", async () => {
      // Arrange
      const favoritesList = Array.from({ length: 15 }, (_, i) => ({
        channel: `streamer_${i}`,
        platform: "twitch",
      }));
      mockFavorites.value = favoritesList;

      const dataObj: any = {};
      favoritesList.forEach((_, i) => {
        dataObj[`c${i}`] = { stream: { title: `Stream ${i}`, viewersCount: 100 + i } };
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ data: dataObj }),
      } as Response);

      // Act
      await sut.checkAll();

      // Assert
      expect(toast.info).toHaveBeenCalledTimes(1);
      const [, options] = vi.mocked(toast.info).mock.calls[0]!;
      expect((options as any)?.description).toContain("notifications.welcomeBodyMore");

      fetchSpy.mockRestore();
    });

    it("should send desktop notification when an offline favorite transitions to online", async () => {
      // Arrange: First check (streamer is offline)
      mockFavorites.value = [{ channel: "gaules", platform: "twitch" }];
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            c0: { profileImageURL: "https://avatar.png", stream: null },
          },
        }),
      } as Response);

      await sut.checkAll();
      expect(toast.info).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();

      // Second check: streamer goes live with title & category
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            c0: {
              profileImageURL: "https://avatar.png",
              stream: {
                title: "Major Finals",
                viewersCount: 50000,
                game: { displayName: "CS2" },
              },
            },
          },
        }),
      } as Response);

      // Act
      await sut.checkAll();

      // Assert
      expect(invoke).toHaveBeenCalledWith(
        "send_notification",
        expect.objectContaining({
          title: expect.stringContaining("gaules"),
          body: expect.stringContaining("Major Finals"),
          channel: "gaules",
          platform: "twitch",
          avatarUrl: "https://avatar.png",
        })
      );

      fetchSpy.mockRestore();
    });

    it("should send desktop notification with title-only or fallback body when category or title are missing", async () => {
      // Arrange: First check (offline)
      mockFavorites.value = [{ channel: "alanzoka", platform: "kick" }];
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ livestream: null }),
      } as Response);

      await sut.checkAll();

      // Second check: live with title only (no category)
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          livestream: {
            session_title: "Just Playing",
            viewer_count: 5000,
            categories: [],
          },
        }),
      } as Response);

      // Act
      await sut.checkAll();

      // Assert
      expect(invoke).toHaveBeenCalledWith(
        "send_notification",
        expect.objectContaining({
          body: expect.stringContaining("notifications.liveBodyTitleOnly"),
        })
      );

      fetchSpy.mockRestore();
    });

    it("should send desktop notification with fallback body when both title and category are missing", async () => {
      // Arrange: First check (offline)
      mockFavorites.value = [{ channel: "coringa", platform: "kick" }];
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ livestream: null }),
      } as Response);

      await sut.checkAll();

      // Second check: live with empty title and empty categories
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          livestream: {
            session_title: "",
            viewer_count: 1000,
            categories: [],
          },
        }),
      } as Response);

      // Act
      await sut.checkAll();

      // Assert
      expect(invoke).toHaveBeenCalledWith(
        "send_notification",
        expect.objectContaining({
          body: expect.stringContaining("notifications.liveBodyFallback"),
        })
      );

      fetchSpy.mockRestore();
    });

    it("should ignore custom or youtube favorites for desktop notifications", async () => {
      // Arrange
      mockFavorites.value = [
        { channel: "custom_ch", platform: "custom" },
        { channel: "yt_video_id", platform: "youtube" },
      ];
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // Act
      await sut.checkAll();

      // Assert
      expect(toast.info).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });
  });

  describe("Watchers & Visibility", () => {
    it("should trigger checkAll when document visibility changes to visible", async () => {
      // Arrange
      mockVisibility.value = "hidden";
      mockFavorites.value = [{ channel: "gaules", platform: "twitch" }];
      await vi.advanceTimersByTimeAsync(1100);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ data: { c0: { stream: null } } }),
      } as Response);

      // Act
      mockVisibility.value = "visible";
      await vi.advanceTimersByTimeAsync(50);

      // Assert
      expect(fetchSpy).toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it("should trigger checkAll via debounce watcher when already polling", async () => {
      // Arrange
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ data: { c0: { stream: null }, c1: { stream: null } } }),
      } as Response);

      mockFavorites.value = [{ channel: "gaules", platform: "twitch" }];
      await vi.advanceTimersByTimeAsync(1100);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Act: Add another channel while polling is active (intervalId is not null)
      mockFavorites.value = [
        { channel: "gaules", platform: "twitch" },
        { channel: "shroud", platform: "twitch" },
      ];
      await vi.advanceTimersByTimeAsync(1100);

      // Assert: checkAll is called again via the debounce watcher
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
    });

    it("should auto-stop polling when all channels are removed", async () => {
      // Arrange
      mockFavorites.value = [{ channel: "gaules", platform: "twitch" }];
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ data: { c0: { stream: null } } }),
      } as Response);

      sut.startPolling();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Act: Remove all channels
      mockFavorites.value = [];
      await vi.advanceTimersByTimeAsync(1100);

      // Advance time to verify interval stopped
      await vi.advanceTimersByTimeAsync(60000);

      // Assert: No new fetch calls were made
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockRestore();
    });

    it("should re-fetch suggestions when visibility becomes visible and stale threshold is met", async () => {
      // Arrange
      mockVisibility.value = "hidden";
      mockStreams.value = [];
      await vi.advanceTimersByTimeAsync(50);

      const baseTime = 1000000;
      vi.setSystemTime(baseTime);
      sut.lastSuggestionsFetch.value = baseTime - 350000;

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { user: null, users: [], streams: { edges: [] } },
        }),
      } as Response);

      // Act
      mockVisibility.value = "visible";
      await vi.advanceTimersByTimeAsync(50);

      // Assert
      expect(sut.lastSuggestionsFetch.value).toBe(baseTime);

      fetchSpy.mockRestore();
    });

    it("should not re-fetch suggestions when visibility becomes visible if not yet stale", async () => {
      // Arrange
      mockVisibility.value = "hidden";
      mockStreams.value = [];
      await vi.advanceTimersByTimeAsync(50);

      const baseTime = 1000000;
      vi.setSystemTime(baseTime);
      sut.lastSuggestionsFetch.value = baseTime - 10000;

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // Act
      mockVisibility.value = "visible";
      await vi.advanceTimersByTimeAsync(50);

      // Assert
      expect(sut.lastSuggestionsFetch.value).toBe(baseTime - 10000);

      fetchSpy.mockRestore();
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

    it("should update lastSuggestionsFetch timestamp when refreshSuggestions is executed", async () => {
      // Arrange
      expect(sut.lastSuggestionsFetch.value).toBe(0);
      const before = Date.now();
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            user: null,
            users: [],
            streams: { edges: [] },
          },
        }),
      } as Response);

      // Act
      await sut.refreshSuggestions();

      // Assert
      expect(sut.lastSuggestionsFetch.value).toBeGreaterThanOrEqual(before);
    });

    it("should early return if already loading suggestions", async () => {
      // Arrange
      sut.isLoadingSuggestions.value = true;

      // Act
      await sut.refreshSuggestions();

      // Assert
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should fetch suggestions from both platforms and interleave them, including phase 2", async () => {
      // Arrange
      let twitchCallCount = 0;
      fetchSpy.mockImplementation(async (url: string | Request | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes("twitch.tv")) {
          twitchCallCount++;
          // First call returns 30 items with nextCursor to trigger Phase 2. Second call returns 1 item.
          const edgeCount = twitchCallCount === 1 ? 30 : 1;
          return {
            ok: true,
            json: async () => ({
              data: {
                streams: {
                  edges: Array.from({ length: edgeCount }).map((_, i) => ({
                    cursor: `cursor_${i}`,
                    node: {
                      broadcaster: {
                        login: `streamer_${twitchCallCount}_${i}`,
                        broadcastSettings: { language: "PT" },
                      },
                      title: "Valo",
                      viewersCount: 10000 - i,
                      game: { displayName: "Valorant" },
                    },
                  })),
                },
              },
            }),
          } as Response;
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
                  language: "Portuguese",
                  categories: [{ name: "Just Chatting" }],
                },
              ],
            }),
          } as Response;
        }
        return { ok: false } as Response;
      });

      // Act
      await sut.refreshSuggestions();

      // Assert
      expect(sut.suggestedStreams.value.length).toBeGreaterThan(0);
      expect(sut.suggestedStreams.value[0]?.platform).toBe("twitch");
      expect(sut.suggestedStreams.value[1]?.platform).toBe("kick");
      expect(twitchCallCount).toBeGreaterThan(1);
    });

    it("should fetch suggestions from Twitch, Kick, and YouTube and interleave all three platforms", async () => {
      // Arrange
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "youtube_get_suggested_streams") {
          return [
            {
              channel: "caze_yt_live",
              displayName: "CazéTV",
              platform: "youtube",
              title: "Copa do Mundo",
              category: "Live",
              viewerCount: 500000,
            },
          ];
        }
        return true;
      });

      fetchSpy.mockImplementation(async (url: string | Request | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes("twitch.tv")) {
          return {
            ok: true,
            json: async () => ({
              data: {
                streams: {
                  edges: [
                    {
                      cursor: "c1",
                      node: {
                        broadcaster: { login: "gaules", broadcastSettings: { language: "PT" } },
                        title: "Tribo",
                        viewersCount: 20000,
                        game: { displayName: "CS2" },
                      },
                    },
                  ],
                },
              },
            }),
          } as Response;
        }
        if (urlStr.includes("featured-livestreams")) {
          return {
            ok: true,
            json: async () => ({
              data: [
                {
                  slug: "coringa",
                  session_title: "RP",
                  viewers: 15000,
                  language: "Portuguese",
                  categories: [{ name: "Grand Theft Auto V (GTA)" }],
                },
              ],
            }),
          } as Response;
        }
        return { ok: false } as Response;
      });

      // Act
      await sut.refreshSuggestions();

      // Assert
      expect(sut.suggestedStreams.value.length).toBe(3);
      expect(sut.suggestedStreams.value[0]?.platform).toBe("twitch");
      expect(sut.suggestedStreams.value[0]?.channel).toBe("gaules");
      expect(sut.suggestedStreams.value[1]?.platform).toBe("kick");
      expect(sut.suggestedStreams.value[1]?.channel).toBe("coringa");
      expect(sut.suggestedStreams.value[1]?.category).toBe("Grand Theft Auto V");
      expect(sut.suggestedStreams.value[2]?.platform).toBe("youtube");
      expect(sut.suggestedStreams.value[2]?.channel).toBe("caze_yt_live");
      expect(sut.suggestedStreams.value[2]?.displayName).toBe("CazéTV");
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
            } as Response;
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
                            broadcaster: { login: "shroud", broadcastSettings: { language: "PT" } },
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
            } as Response;
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
                  language: "Portuguese",
                  categories: [{ name: "Valorant" }],
                },
              ],
            }),
          } as Response;
        }
        return { ok: false } as Response;
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

    it("should fallback to derived slug when searchCategories returns no match", async () => {
      // Arrange
      let queryBody = "";
      fetchSpy.mockImplementation(async (url: string | Request | URL, options?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes("twitch.tv/gql")) {
          const body = typeof options?.body === "string" ? options.body : "";
          if (body.includes("searchCategories")) {
            return {
              ok: true,
              json: async () => ({
                data: { searchCategories: { edges: [] } },
              }),
            } as Response;
          }
          queryBody = body;
          return {
            ok: true,
            json: async () => ({
              data: {
                game: {
                  streams: {
                    edges: [
                      {
                        node: {
                          broadcaster: { login: "gamer", broadcastSettings: { language: "PT" } },
                          title: "Playing",
                          viewersCount: 500,
                          game: { displayName: "Just Chatting" },
                        },
                      },
                    ],
                  },
                },
              },
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({ data: [] }) } as Response;
      });

      // Act
      const results = await sut.fetchStreamsForCategory("Just Chatting");

      // Assert
      expect(results.length).toBe(1);
      expect(results[0]?.channel).toBe("gamer");
      const parsed = JSON.parse(queryBody);
      expect(parsed.query).toContain('game(slug: "just-chatting")');
    });

    it("should fallback to global category query if language-filtered returns 0 streams", async () => {
      // Arrange
      let callCount = 0;
      fetchSpy.mockImplementation(async (url: string | Request | URL, options?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes("twitch.tv/gql")) {
          const body = typeof options?.body === "string" ? options.body : "";
          if (body.includes("searchCategories")) {
            return {
              ok: true,
              json: async () => ({
                data: { searchCategories: { edges: [{ node: { slug: "rare-game" } }] } },
              }),
            } as Response;
          }

          callCount++;
          // First call (with language) returns 0 streams, second call (global) returns 1
          if (callCount === 1) {
            return {
              ok: true,
              json: async () => ({ data: { game: { streams: { edges: [] } } } }),
            } as Response;
          }

          return {
            ok: true,
            json: async () => ({
              data: {
                game: {
                  streams: {
                    edges: [
                      {
                        node: {
                          broadcaster: {
                            login: "foreign_streamer",
                            broadcastSettings: { language: "EN" },
                          },
                          title: "Rare Game Play",
                          viewersCount: 200,
                          game: { displayName: "Rare Game" },
                        },
                      },
                    ],
                  },
                },
              },
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({ data: [] }) } as Response;
      });

      // Act
      const results = await sut.fetchStreamsForCategory("Rare Game");

      // Assert
      expect(results.length).toBe(1);
      expect(results[0]?.channel).toBe("foreign_streamer");
      expect(callCount).toBe(2);
    });

    it("should gracefully return empty list or partial results when category API rejects", async () => {
      // Arrange: Twitch rejects, Kick returns 1 stream
      fetchSpy.mockImplementation(async (url: string | Request | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes("twitch.tv/gql")) {
          throw new Error("Twitch category failure");
        }
        if (urlStr.includes("featured-livestreams")) {
          return {
            ok: true,
            json: async () => ({
              data: [
                {
                  slug: "kick_streamer",
                  session_title: "Playing",
                  viewers: 1000,
                  language: "Portuguese",
                  categories: [{ name: "Valorant" }],
                },
              ],
            }),
          } as Response;
        }
        return { ok: false } as Response;
      });

      // Act
      const results = await sut.fetchStreamsForCategory("Valorant");

      // Assert
      expect(results.length).toBe(1);
      expect(results[0]?.platform).toBe("kick");
      expect(results[0]?.channel).toBe("kick_streamer");
    });
  });

  describe("Notification correctness (isFirstCheck)", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockIsTauri.mockReturnValue(true);
      mockNotificationsEnabled.value = true;
      fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it("should not re-fire notifications for already-live favorites on subsequent checks (EC-isFirstCheck regression)", async () => {
      // Arrange — gaules is a favorite and is live
      mockFavorites.value = [{ channel: "gaules", platform: "twitch" }];
      mockRecents.value = [{ channel: "gaules", platform: "twitch" }];

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            c0: {
              stream: { title: "FURIA vs NaVi", viewersCount: 50000, game: { displayName: "CS2" } },
              profileImageURL: null,
            },
          },
        }),
      } as any);

      // Act — first check sets hasCompletedFirstCheck = true
      const p1 = sut.checkAll();
      await vi.advanceTimersByTimeAsync(500);
      await p1;

      // toast.info fires once for the welcome notification
      expect(vi.mocked(toast.info)).toHaveBeenCalledTimes(1);
      vi.mocked(toast.info).mockClear();

      // Act — second check (simulates foreground wake-up or next interval tick)
      const p2 = sut.checkAll();
      await vi.advanceTimersByTimeAsync(500);
      await p2;

      // Assert — no new notification: gaules was already live, isFirstCheck is now false
      expect(vi.mocked(toast.info)).not.toHaveBeenCalled();
      expect(vi.mocked(invoke)).not.toHaveBeenCalledWith(
        "send_notification",
        expect.objectContaining({ channel: "gaules" })
      );
    });

    it("should not re-fire notifications after a foreground wake-up check (visibility watcher)", async () => {
      // Arrange — complete a first check so hasCompletedFirstCheck = true
      mockFavorites.value = [{ channel: "alanzoka", platform: "kick" }];
      mockRecents.value = [{ channel: "alanzoka", platform: "kick" }];

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          livestream: {
            viewer_count: 20000,
            session_title: "ranked",
            categories: [{ name: "Valorant" }],
            thumbnail: null,
          },
          user: { profile_pic: null },
        }),
      } as any);

      const p1 = sut.checkAll();
      await vi.advanceTimersByTimeAsync(500);
      await p1;
      vi.mocked(toast.info).mockClear();
      vi.mocked(invoke as any).mockClear();

      // Act — simulate visibility change (user returns to app)
      mockVisibility.value = "hidden";
      mockVisibility.value = "visible";
      const p2 = sut.checkAll();
      await vi.advanceTimersByTimeAsync(500);
      await p2;

      // Assert — no spurious notifications fired
      expect(vi.mocked(toast.info)).not.toHaveBeenCalled();
      expect(vi.mocked(invoke)).not.toHaveBeenCalledWith(
        "send_notification",
        expect.objectContaining({ channel: "alanzoka" })
      );
    });

    it("should not fire spurious notifications when API returns stream:null for a single cycle (flaky read)", async () => {
      // Arrange — gaules is live
      mockFavorites.value = [{ channel: "gaules", platform: "twitch" }];
      mockRecents.value = [{ channel: "gaules", platform: "twitch" }];

      const liveResponse = {
        ok: true,
        json: async () => ({
          data: {
            c0: {
              stream: { title: "CS2", viewersCount: 80000, game: { displayName: "CS2" } },
              profileImageURL: null,
            },
          },
        }),
      } as any;
      const offlineResponse = {
        ok: true,
        json: async () => ({
          data: { c0: { stream: null, profileImageURL: null } }, // API glitch: stream null
        }),
      } as any;

      // Cycle 1: live — first check, welcome toast fires
      fetchSpy.mockResolvedValueOnce(liveResponse);
      let p = sut.checkAll();
      await vi.advanceTimersByTimeAsync(500);
      await p;
      vi.mocked(toast.info).mockClear();
      vi.mocked(invoke as any).mockClear();

      // Cycle 2: API glitch — stream:null (single bad read)
      fetchSpy.mockResolvedValueOnce(offlineResponse);
      p = sut.checkAll();
      await vi.advanceTimersByTimeAsync(500);
      await p;

      // Cycle 3: API recovers — gaules is live again
      fetchSpy.mockResolvedValueOnce(liveResponse);
      p = sut.checkAll();
      await vi.advanceTimersByTimeAsync(500);
      await p;

      // Assert — no "went live" notification: previousStatuses debounce prevented
      // the single bad read from resetting the "was live" flag
      expect(vi.mocked(toast.info)).not.toHaveBeenCalled();
      expect(vi.mocked(invoke)).not.toHaveBeenCalledWith(
        "send_notification",
        expect.objectContaining({ channel: "gaules" })
      );
    });
  });
});

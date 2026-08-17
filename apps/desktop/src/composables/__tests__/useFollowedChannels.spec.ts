import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useFollowedChannels } from "../useFollowedChannels";
import type { FavoriteChannel } from "../useFavorites";
import { ref, nextTick } from "vue";
import { invoke } from "@tauri-apps/api/core";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Mock @vueuse/core to bypass createSharedComposable singleton behavior for tests
vi.mock("@vueuse/core", () => ({
  createSharedComposable: (fn: any) => fn,
}));

// Mock useUpdater (isTauri)
const mockIsTauri = vi.fn(() => true);
vi.mock("../useUpdater", () => ({
  isTauri: () => mockIsTauri(),
}));

// Mock composables dependencies
const mockTwitchAuth = { authenticated: ref(false) };
vi.mock("../useTwitchAuth", () => ({
  useTwitchAuth: () => mockTwitchAuth,
}));

const mockKickAuth = { authenticated: ref(false) };
vi.mock("../useKickAuth", () => ({
  useKickAuth: () => mockKickAuth,
}));

const mockLiveStatus = { statuses: ref({}), isChecking: ref(false) };
vi.mock("../useLiveStatus", () => ({
  useLiveStatus: () => mockLiveStatus,
}));

const mockFavorites = { favorites: ref<FavoriteChannel[]>([]) };
vi.mock("../useFavorites", () => ({
  useFavorites: () => mockFavorites,
}));

describe("useFollowedChannels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue([]);
    mockIsTauri.mockReturnValue(true);
    mockTwitchAuth.authenticated.value = false;
    mockKickAuth.authenticated.value = false;
    mockLiveStatus.statuses.value = {};
    mockLiveStatus.isChecking.value = false;
    mockFavorites.favorites.value = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return empty channels initially if not authenticated", () => {
    // Arrange
    mockTwitchAuth.authenticated.value = false;
    mockKickAuth.authenticated.value = false;

    // Act
    const { channels } = useFollowedChannels();

    // Assert
    expect(channels.value).toEqual([]);
  });

  it("should not fetch twitch channels if twitch is not authenticated", async () => {
    // Arrange
    mockTwitchAuth.authenticated.value = false;

    // Act
    const { refresh } = useFollowedChannels();
    await refresh();

    // Assert
    expect(invoke).not.toHaveBeenCalledWith("twitch_get_followed_streams");
  });

  it("should fetch twitch channels if twitch is authenticated", async () => {
    // Arrange
    mockTwitchAuth.authenticated.value = true;
    const mockTwitchData = [
      { id: "123", platform: "twitch", displayName: "TestTwitch", isLive: true, viewerCount: 100 },
    ];
    vi.mocked(invoke).mockResolvedValueOnce(mockTwitchData);

    // Act
    const { refresh, channels } = useFollowedChannels();
    await refresh();

    // Assert
    expect(invoke).toHaveBeenCalledWith("twitch_get_followed_streams");
    expect(channels.value).toEqual([{ ...mockTwitchData[0], isFollowed: true }]);
  });

  it("should populate kick channels from favorites and statuses when kick is authenticated", () => {
    // Arrange
    mockKickAuth.authenticated.value = true;
    mockFavorites.favorites.value = [{ channel: "testkick", platform: "kick", addedAt: 0 }];
    mockLiveStatus.statuses.value = {
      "kick:testkick": {
        isLive: true,
        viewerCount: 50,
        title: "Test Kick Stream",
        category: "Just Chatting",
        avatarUrl: "http://avatar.com/kick",
        thumbnailUrl: "http://thumb.com/kick",
      } as any,
    };

    // Act
    const { channels } = useFollowedChannels();

    // Assert
    expect(channels.value).toHaveLength(1);
    expect(channels.value[0]).toEqual({
      id: "testkick",
      platform: "kick",
      displayName: "testkick",
      avatarUrl: "http://avatar.com/kick",
      isLive: true,
      viewerCount: 50,
      title: "Test Kick Stream",
      game: "Just Chatting",
      thumbnailUrl: "http://thumb.com/kick",
      isFavorite: true,
    });
  });

  it("should combine and sort channels correctly", async () => {
    // Arrange
    mockTwitchAuth.authenticated.value = true;
    mockKickAuth.authenticated.value = true;

    const mockTwitchData = [
      { id: "1", platform: "twitch", displayName: "A_Twitch", isLive: true, viewerCount: 10 },
      { id: "2", platform: "twitch", displayName: "B_Twitch", isLive: false, viewerCount: 0 },
    ];
    vi.mocked(invoke).mockResolvedValueOnce(mockTwitchData);

    mockFavorites.favorites.value = [{ channel: "C_Kick", platform: "kick", addedAt: 0 }];
    mockLiveStatus.statuses.value = {
      "kick:c_kick": { isLive: true, viewerCount: 50 } as any,
    };

    const { refresh, channels } = useFollowedChannels();
    await refresh();

    // Act (Sorting rules: viewerCount desc, then isLive, then displayName)
    // C_Kick (50 viewers) should be first
    // A_Twitch (10 viewers) should be second
    // B_Twitch (0 viewers, offline) should be last

    // Assert
    expect(channels.value).toHaveLength(3);
    expect(channels.value[0]?.displayName).toBe("C_Kick");
    expect(channels.value[1]?.displayName).toBe("A_Twitch");
    expect(channels.value[2]?.displayName).toBe("B_Twitch");
  });

  it("should filter channels by platform correctly", async () => {
    // Arrange
    mockTwitchAuth.authenticated.value = true;
    mockKickAuth.authenticated.value = true;

    vi.mocked(invoke).mockResolvedValueOnce([
      { id: "1", platform: "twitch", displayName: "A", isLive: true, viewerCount: 10 },
    ]);
    mockFavorites.favorites.value = [{ channel: "B", platform: "kick", addedAt: 0 }];
    mockLiveStatus.statuses.value = {
      "kick:b": { isLive: true, viewerCount: 50 } as any,
    };

    const { refresh, channels, platformFilter } = useFollowedChannels();
    await refresh();

    // Act & Assert
    expect(channels.value).toHaveLength(2);

    platformFilter.value = "twitch";
    expect(channels.value).toHaveLength(1);
    expect(channels.value[0]?.platform).toBe("twitch");

    platformFilter.value = "kick";
    expect(channels.value).toHaveLength(1);
    expect(channels.value[0]?.platform).toBe("kick");
  });

  it("should handle twitch fetch errors gracefully", async () => {
    // Arrange
    mockTwitchAuth.authenticated.value = true;
    vi.mocked(invoke).mockRejectedValueOnce(new Error("Network Error"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Act
    const { refresh, channels } = useFollowedChannels();
    await refresh();

    // Assert
    expect(consoleSpy).toHaveBeenCalled();
    expect(channels.value).toEqual([]);

    consoleSpy.mockRestore();
  });

  it("should report isInitialLoading false for fresh install with no auth and no favorites", () => {
    // Arrange
    mockTwitchAuth.authenticated.value = false;
    mockFavorites.favorites.value = [];

    // Act
    const { isInitialLoading } = useFollowedChannels();

    // Assert
    expect(isInitialLoading.value).toBe(false);
  });

  it("should handle isInitialLoading transition during initial authenticated load", async () => {
    // Arrange
    mockTwitchAuth.authenticated.value = true;
    let resolveInvoke: (val: any) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolveInvoke = resolve;
    });
    vi.mocked(invoke).mockReturnValueOnce(pendingPromise as any);

    // Act
    const { refresh, isInitialLoading } = useFollowedChannels();
    const refreshPromise = refresh();

    // Assert (during fetch)
    expect(isInitialLoading.value).toBe(true);

    // Act (resolve fetch)
    resolveInvoke([{ id: "123", platform: "twitch", displayName: "Streamer", isLive: true }]);
    await refreshPromise;

    // Assert (after initial fetch)
    expect(isInitialLoading.value).toBe(false);
  });

  it("should trigger isInitialLoading when user logs in after launching app unauthenticated", async () => {
    // Arrange
    mockTwitchAuth.authenticated.value = false;
    const { isInitialLoading } = useFollowedChannels();
    expect(isInitialLoading.value).toBe(false);

    let resolveInvoke: (val: any) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolveInvoke = resolve;
    });
    vi.mocked(invoke).mockReturnValueOnce(pendingPromise as any);

    // Act - User logs in
    mockTwitchAuth.authenticated.value = true;
    await nextTick();

    // Assert during fetch
    expect(isInitialLoading.value).toBe(true);

    // Resolve login fetch
    resolveInvoke([{ id: "456", platform: "twitch", displayName: "Streamer2", isLive: true }]);
    await nextTick();
    await vi.runAllTimersAsync();

    // Assert after fetch
    expect(isInitialLoading.value).toBe(false);
    expect(invoke).toHaveBeenCalledWith("twitch_get_followed_streams");
  });

  it("should trigger isInitialLoading when unauthenticated user adds a favorite channel with unchecked status", async () => {
    // Arrange
    mockTwitchAuth.authenticated.value = false;
    mockFavorites.favorites.value = [];
    const { isInitialLoading, channels } = useFollowedChannels();
    expect(isInitialLoading.value).toBe(false);

    // Act - User adds a favorite channel while checking status
    mockFavorites.favorites.value = [
      { channel: "streamer_kick", platform: "kick", addedAt: Date.now() },
    ];
    mockLiveStatus.isChecking.value = true;
    await nextTick();

    // Assert (during check of unchecked favorite)
    expect(isInitialLoading.value).toBe(true);

    // Act - Status check completes with live status
    mockLiveStatus.statuses.value = {
      "kick:streamer_kick": {
        isLive: true,
        viewerCount: 150,
        title: "Playing game",
        category: "Just Chatting",
      } as any,
    };
    mockLiveStatus.isChecking.value = false;
    await nextTick();

    // Assert (after check, isInitialLoading false and channel is live)
    expect(isInitialLoading.value).toBe(false);
    expect(channels.value).toHaveLength(1);
    expect(channels.value[0]?.displayName).toBe("streamer_kick");
  });
});

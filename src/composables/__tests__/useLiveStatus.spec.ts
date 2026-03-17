import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useLiveStatus } from "../useLiveStatus";
import { ref } from "vue";

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
  let sut: ReturnType<typeof useLiveStatus>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockRecents.value = [];

    sut = useLiveStatus();
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
      mockRecents.value = [
        { channel: "gaules", platform: "twitch", addedAt: Date.now() },
      ];
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
      mockRecents.value = [
        { channel: "gaules", platform: "twitch", addedAt: Date.now() },
      ];
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
});

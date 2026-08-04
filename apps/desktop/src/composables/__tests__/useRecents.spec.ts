import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useRecents } from "../useRecents";

describe("useRecents composable unit tests", () => {
  let sut: ReturnType<typeof useRecents>;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    // mock Date.now()
    vi.useFakeTimers();

    sut = useRecents();
    sut.clearRecents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should add a new recent channel to the top of the list", () => {
    // Arrange
    const { addRecent, recents } = sut;
    const now = 1600000000000;
    vi.setSystemTime(new Date(now));

    // Act
    addRecent("gaules", "twitch");

    // Assert
    expect(recents.value.length).toBe(1);
    expect(recents.value[0]?.channel).toBe("gaules");
    expect(recents.value[0]?.platform).toBe("twitch");
    expect(recents.value[0]?.addedAt).toBe(now);
  });

  it("should prevent duplicates and move the channel to the top if already exists", () => {
    // Arrange
    const { addRecent, recents } = sut;

    // Act
    addRecent("gaules", "twitch");
    addRecent("alanzoka", "twitch");

    // Assert (before duplicate addition)
    expect(recents.value.length).toBe(2);
    expect(recents.value[0]?.channel).toBe("alanzoka"); // Top

    // Act (add gaules again to move it to top)
    vi.setSystemTime(new Date(1600000005000));
    addRecent("gaules", "twitch");

    // Assert
    expect(recents.value.length).toBe(2);
    expect(recents.value[0]?.channel).toBe("gaules"); // Moved to the top
    expect(recents.value[1]?.channel).toBe("alanzoka");
  });

  it("should handle duplicates case-insensitively", () => {
    // Arrange
    const { addRecent, recents } = sut;

    // Act
    addRecent("Gaules", "twitch");
    addRecent("gAuLeS", "twitch");

    // Assert
    expect(recents.value.length).toBe(1);
    expect(recents.value[0]?.channel).toBe("gAuLeS");
  });

  it("should allow same channel name but from different platforms", () => {
    // Arrange
    const { addRecent, recents } = sut;

    // Act
    addRecent("ninja", "twitch");
    addRecent("ninja", "kick");

    // Assert
    expect(recents.value.length).toBe(2);
  });

  it("should limit the recent list to a maximum of 8 items", () => {
    // Arrange
    const { addRecent, recents } = sut;

    // Act
    for (let i = 1; i <= 10; i++) {
      addRecent(`streamer${i}`, "twitch");
    }

    // Assert
    expect(recents.value.length).toBe(8);
    expect(recents.value[0]?.channel).toBe("streamer10"); // Last added
    expect(recents.value[7]?.channel).toBe("streamer3"); // First added
  });

  it("should remove a specific recent channel", () => {
    // Arrange
    const { addRecent, removeRecent, recents } = sut;

    addRecent("gaules", "twitch");
    addRecent("alanzoka", "twitch");

    expect(recents.value.length).toBe(2);

    // Act
    removeRecent("Gaules", "twitch"); // Should be case-insensitive remove

    // Assert
    expect(recents.value.length).toBe(1);
    expect(recents.value[0]?.channel).toBe("alanzoka");
  });

  it("should clear all recent channels", () => {
    // Arrange
    const { addRecent, clearRecents, recents } = sut;

    addRecent("gaules", "twitch");
    addRecent("alanzoka", "youtube");

    expect(recents.value.length).toBe(2);

    // Act
    clearRecents();

    // Assert
    expect(recents.value.length).toBe(0);
  });
});

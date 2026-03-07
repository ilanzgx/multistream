import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePreferences } from "../usePreferences";

describe("usePreferences composable unit tests", () => {
  let sut: ReturnType<typeof usePreferences>;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    sut = usePreferences();
    sut.resetPreferences();
  });

  it("should initialize with default preferences", () => {
    // Arrange & Act
    const { selectedChat, sidebarOpen, notificationsEnabled } = sut;

    // Assert
    expect(selectedChat.value).toBe("");
    expect(sidebarOpen.value).toBe(true);
    expect(notificationsEnabled.value).toBe(true);
  });

  it("should set selected chat correctly", () => {
    // Arrange
    const { setSelectedChat, selectedChat } = sut;

    // Act
    setSelectedChat("gaules_twitch");

    // Assert
    expect(selectedChat.value).toBe("gaules_twitch");
  });

  it("should toggle sidebar open state", () => {
    // Arrange
    const { toggleSidebar, sidebarOpen } = sut;
    expect(sidebarOpen.value).toBe(true); // default

    // Act
    toggleSidebar();

    // Assert
    expect(sidebarOpen.value).toBe(false);

    // Act again
    toggleSidebar();

    // Assert again
    expect(sidebarOpen.value).toBe(true);
  });

  it("should set sidebar open state explicitly", () => {
    // Arrange
    const { setSidebarOpen, sidebarOpen } = sut;

    // Act (set to false)
    setSidebarOpen(false);

    // Assert
    expect(sidebarOpen.value).toBe(false);

    // Act (set to true)
    setSidebarOpen(true);

    // Assert
    expect(sidebarOpen.value).toBe(true);
  });

  it("should reset all preferences to defaults", () => {
    // Arrange
    const {
      setSelectedChat,
      setSidebarOpen,
      notificationsEnabled,
      resetPreferences,
      selectedChat,
      sidebarOpen,
    } = sut;

    // Tweak properties
    setSelectedChat("alanzoka_twitch");
    setSidebarOpen(false);
    notificationsEnabled.value = false;

    expect(selectedChat.value).toBe("alanzoka_twitch");
    expect(sidebarOpen.value).toBe(false);
    expect(notificationsEnabled.value).toBe(false);

    // Act
    resetPreferences();

    // Assert
    expect(selectedChat.value).toBe("");
    expect(sidebarOpen.value).toBe(true);
    expect(notificationsEnabled.value).toBe(true);
  });
});

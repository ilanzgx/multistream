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
    const {
      selectedChat,
      sidebarOpen,
      notificationsEnabled,
      onboardingCompleted,
      nativePlayerEnabled,
      adblockEnabled,
    } = sut;

    // Assert
    expect(selectedChat.value).toBe("");
    expect(sidebarOpen.value).toBe(true);
    expect(notificationsEnabled.value).toBe(true);
    expect(onboardingCompleted.value).toBe(false);
    expect(nativePlayerEnabled.value).toBe(false);
    expect(adblockEnabled.value).toBe(true);
  });

  it("should set selected chat correctly", () => {
    // Arrange
    const { setSelectedChat, selectedChat } = sut;

    // Act
    setSelectedChat("gaules_twitch");

    // Assert
    expect(selectedChat.value).toBe("gaules_twitch");
  });

  it("should set onboarding completed state correctly", () => {
    // Arrange
    const { setOnboardingCompleted, onboardingCompleted } = sut;

    // Act
    setOnboardingCompleted(true);

    // Assert
    expect(onboardingCompleted.value).toBe(true);
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

  it("should toggle followed sidebar open state", () => {
    // Arrange
    const { toggleFollowedSidebar, followedSidebarOpen } = sut;
    expect(followedSidebarOpen.value).toBe(false); // default

    // Act
    toggleFollowedSidebar();

    // Assert
    expect(followedSidebarOpen.value).toBe(true);

    // Act again
    toggleFollowedSidebar();

    // Assert again
    expect(followedSidebarOpen.value).toBe(false);
  });

  it("should set followed sidebar open state explicitly", () => {
    // Arrange
    const { setFollowedSidebarOpen, followedSidebarOpen } = sut;

    // Act (set to true)
    setFollowedSidebarOpen(true);

    // Assert
    expect(followedSidebarOpen.value).toBe(true);

    // Act (set to false)
    setFollowedSidebarOpen(false);

    // Assert
    expect(followedSidebarOpen.value).toBe(false);
  });

  it("should set recording quality correctly", () => {
    // Arrange
    const { setRecordingQuality, recordingQuality } = sut;

    // Act
    setRecordingQuality("720p");

    // Assert
    expect(recordingQuality.value).toBe("720p");
  });

  it("should set recording path correctly", () => {
    // Arrange
    const { setRecordingPath, recordingPath } = sut;

    // Act
    setRecordingPath("D:/videos");

    // Assert
    expect(recordingPath.value).toBe("D:/videos");
  });

  it("should set adblock enabled state correctly", () => {
    // Arrange
    const { setAdblockEnabled, adblockEnabled } = sut;
    expect(adblockEnabled.value).toBe(true);

    // Act
    setAdblockEnabled(false);

    // Assert
    expect(adblockEnabled.value).toBe(false);

    // Act again
    setAdblockEnabled(true);

    // Assert again
    expect(adblockEnabled.value).toBe(true);
  });

  it("should reset all preferences to default values", () => {
    // Arrange
    const {
      resetPreferences,
      setSelectedChat,
      selectedChat,
      setSidebarOpen,
      sidebarOpen,
      setFollowedSidebarOpen,
      followedSidebarOpen,
      notificationsEnabled,
      setOnboardingCompleted,
      onboardingCompleted,
      nativePlayerEnabled,
      adblockEnabled,
      setAdblockEnabled,
      setRecordingQuality,
      recordingQuality,
      setRecordingPath,
      recordingPath,
    } = sut;

    // Tweak properties
    setSelectedChat("alanzoka_twitch");
    setSidebarOpen(false);
    setFollowedSidebarOpen(true);
    notificationsEnabled.value = false;
    setOnboardingCompleted(true);
    nativePlayerEnabled.value = true;
    setAdblockEnabled(false);
    setRecordingQuality("480p");
    setRecordingPath("C:/test");

    expect(selectedChat.value).toBe("alanzoka_twitch");
    expect(sidebarOpen.value).toBe(false);
    expect(followedSidebarOpen.value).toBe(true);
    expect(notificationsEnabled.value).toBe(false);
    expect(onboardingCompleted.value).toBe(true);
    expect(nativePlayerEnabled.value).toBe(true);
    expect(adblockEnabled.value).toBe(false);
    expect(recordingQuality.value).toBe("480p");
    expect(recordingPath.value).toBe("C:/test");

    // Act
    resetPreferences();

    // Assert
    expect(selectedChat.value).toBe("");
    expect(sidebarOpen.value).toBe(true);
    expect(followedSidebarOpen.value).toBe(false);
    expect(notificationsEnabled.value).toBe(true);
    expect(onboardingCompleted.value).toBe(false);
    expect(nativePlayerEnabled.value).toBe(false);
    expect(adblockEnabled.value).toBe(true);
    expect(recordingQuality.value).toBe("best");
    expect(recordingPath.value).toBe("");
  });
});

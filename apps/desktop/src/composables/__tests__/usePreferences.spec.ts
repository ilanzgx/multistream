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
    } = sut;

    // Assert
    expect(selectedChat.value).toBe("");
    expect(sidebarOpen.value).toBe(true);
    expect(notificationsEnabled.value).toBe(true);
    expect(onboardingCompleted.value).toBe(false);
    expect(nativePlayerEnabled.value).toBe(false);
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

  it("should reset all preferences to defaults", () => {
    // Arrange
    const {
      setSelectedChat,
      setSidebarOpen,
      notificationsEnabled,
      setOnboardingCompleted,
      nativePlayerEnabled,
      setRecordingQuality,
      setRecordingPath,
      recordingEnabled,
      resetPreferences,
      selectedChat,
      sidebarOpen,
      onboardingCompleted,
      recordingQuality,
      recordingPath,
    } = sut;

    // Tweak properties
    setSelectedChat("alanzoka_twitch");
    setSidebarOpen(false);
    notificationsEnabled.value = false;
    setOnboardingCompleted(true);
    nativePlayerEnabled.value = true;
    setRecordingQuality("480p");
    setRecordingPath("C:/test");
    recordingEnabled.value = true;

    expect(selectedChat.value).toBe("alanzoka_twitch");
    expect(sidebarOpen.value).toBe(false);
    expect(notificationsEnabled.value).toBe(false);
    expect(onboardingCompleted.value).toBe(true);
    expect(nativePlayerEnabled.value).toBe(true);
    expect(recordingQuality.value).toBe("480p");
    expect(recordingPath.value).toBe("C:/test");
    expect(recordingEnabled.value).toBe(true);

    // Act
    resetPreferences();

    // Assert
    expect(selectedChat.value).toBe("");
    expect(sidebarOpen.value).toBe(true);
    expect(notificationsEnabled.value).toBe(true);
    expect(onboardingCompleted.value).toBe(false);
    expect(nativePlayerEnabled.value).toBe(false);
    expect(recordingQuality.value).toBe("best");
    expect(recordingPath.value).toBe("");
    expect(recordingEnabled.value).toBe(false);
  });
});

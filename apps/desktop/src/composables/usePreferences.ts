import { createSharedComposable, useStorage } from "@vueuse/core";

export interface Preferences {
  selectedChat: string;
  sidebarOpen: boolean;
  followedSidebarOpen: boolean;
  notificationsEnabled: boolean;
  onboardingCompleted: boolean;

  recordingQuality: string;
  recordingPath: string;
  nativePlayerEnabled: boolean;
  adblockEnabled: boolean;
}

const defaultPreferences: Preferences = {
  selectedChat: "",
  sidebarOpen: true,
  followedSidebarOpen: false,
  notificationsEnabled: true,
  onboardingCompleted: false,

  recordingQuality: "best",
  recordingPath: "",
  nativePlayerEnabled: false,
  adblockEnabled: true,
};

const _usePreferences = () => {
  /**
   * @brief Selected chat
   */
  const selectedChat = useStorage<string>(
    "preferences.selectedChat",
    defaultPreferences.selectedChat
  );

  /**
   * @brief Sidebar open state
   */
  const sidebarOpen = useStorage<boolean>(
    "preferences.sidebarOpen",
    defaultPreferences.sidebarOpen
  );

  /**
   * @brief Followed channels sidebar open state
   */
  const followedSidebarOpen = useStorage<boolean>(
    "preferences.followedSidebarOpen",
    defaultPreferences.followedSidebarOpen
  );

  /**
   * @brief Notifications enabled
   */
  const notificationsEnabled = useStorage<boolean>(
    "preferences.notificationsEnabled",
    defaultPreferences.notificationsEnabled
  );

  /**
   * @brief Onboarding completed state
   */
  const onboardingCompleted = useStorage<boolean>(
    "preferences.onboardingCompleted",
    defaultPreferences.onboardingCompleted
  );

  const recordingQuality = useStorage<string>(
    "preferences.recordingQuality",
    defaultPreferences.recordingQuality
  );

  const recordingPath = useStorage<string>(
    "preferences.recordingPath",
    defaultPreferences.recordingPath
  );

  const nativePlayerEnabled = useStorage<boolean>(
    "preferences.nativePlayerEnabled",
    defaultPreferences.nativePlayerEnabled
  );

  const adblockEnabled = useStorage<boolean>(
    "preferences.adblockEnabled",
    defaultPreferences.adblockEnabled
  );

  /**
   * @brief Set the selected chat
   *
   * @param chatId The chat ID
   * @return void
   */
  const setSelectedChat = (chatId: string) => {
    selectedChat.value = chatId;
  };

  const setRecordingQuality = (quality: string) => {
    recordingQuality.value = quality;
  };

  const setRecordingPath = (path: string) => {
    recordingPath.value = path;
  };

  const setAdblockEnabled = (enabled: boolean) => {
    adblockEnabled.value = enabled;
  };

  /**
   * @brief Toggle the sidebar
   *
   * @return void
   */
  const toggleSidebar = () => {
    sidebarOpen.value = !sidebarOpen.value;
  };

  /**
   * @brief Set the sidebar open state
   *
   * @param open The open state
   * @return void
   */
  const setSidebarOpen = (open: boolean) => {
    sidebarOpen.value = open;
  };

  /**
   * @brief Toggle the followed channels sidebar
   *
   * @return void
   */
  const toggleFollowedSidebar = () => {
    followedSidebarOpen.value = !followedSidebarOpen.value;
  };

  /**
   * @brief Set the followed channels sidebar open state
   *
   * @param open The open state
   * @return void
   */
  const setFollowedSidebarOpen = (open: boolean) => {
    followedSidebarOpen.value = open;
  };

  /**
   * @brief Set the onboarding completed state
   *
   * @param completed The completed state
   * @return void
   */
  const setOnboardingCompleted = (completed: boolean) => {
    onboardingCompleted.value = completed;
  };

  /**
   * @brief Reset the preferences to default
   *
   * @return void
   */
  const resetPreferences = () => {
    selectedChat.value = defaultPreferences.selectedChat;
    sidebarOpen.value = defaultPreferences.sidebarOpen;
    followedSidebarOpen.value = defaultPreferences.followedSidebarOpen;
    notificationsEnabled.value = defaultPreferences.notificationsEnabled;
    onboardingCompleted.value = defaultPreferences.onboardingCompleted;

    recordingQuality.value = defaultPreferences.recordingQuality;
    recordingPath.value = defaultPreferences.recordingPath;
    nativePlayerEnabled.value = defaultPreferences.nativePlayerEnabled;
    adblockEnabled.value = defaultPreferences.adblockEnabled;
  };

  return {
    // state
    selectedChat,
    sidebarOpen,
    followedSidebarOpen,
    notificationsEnabled,
    onboardingCompleted,

    recordingQuality,
    recordingPath,
    nativePlayerEnabled,
    adblockEnabled,

    // actions
    setSelectedChat,
    toggleSidebar,
    setSidebarOpen,
    toggleFollowedSidebar,
    setFollowedSidebarOpen,
    setOnboardingCompleted,
    setRecordingQuality,
    setRecordingPath,
    setAdblockEnabled,
    resetPreferences,
  };
};

export const usePreferences = createSharedComposable(_usePreferences);

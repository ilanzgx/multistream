import { createSharedComposable, useStorage } from "@vueuse/core";

export interface Preferences {
  selectedChat: string;
  sidebarOpen: boolean;
  notificationsEnabled: boolean;
  onboardingCompleted: boolean;
  recordingEnabled: boolean;
  recordingQuality: string;
  recordingPath: string;
}

const defaultPreferences: Preferences = {
  selectedChat: "",
  sidebarOpen: true,
  notificationsEnabled: true,
  onboardingCompleted: false,
  recordingEnabled: false,
  recordingQuality: "best",
  recordingPath: "",
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

  const recordingEnabled = useStorage<boolean>(
    "preferences.recordingEnabled",
    defaultPreferences.recordingEnabled
  );

  const recordingQuality = useStorage<string>(
    "preferences.recordingQuality",
    defaultPreferences.recordingQuality
  );

  const recordingPath = useStorage<string>(
    "preferences.recordingPath",
    defaultPreferences.recordingPath
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
    notificationsEnabled.value = defaultPreferences.notificationsEnabled;
    onboardingCompleted.value = defaultPreferences.onboardingCompleted;
    recordingEnabled.value = defaultPreferences.recordingEnabled;
    recordingQuality.value = defaultPreferences.recordingQuality;
    recordingPath.value = defaultPreferences.recordingPath;
  };

  return {
    // state
    selectedChat,
    sidebarOpen,
    notificationsEnabled,
    onboardingCompleted,
    recordingEnabled,
    recordingQuality,
    recordingPath,

    // actions
    setSelectedChat,
    toggleSidebar,
    setSidebarOpen,
    setOnboardingCompleted,
    setRecordingQuality,
    setRecordingPath,
    resetPreferences,
  };
};

export const usePreferences = createSharedComposable(_usePreferences);

import { createSharedComposable, useStorage } from "@vueuse/core";

export interface Preferences {
  selectedChat: string;
  sidebarOpen: boolean;
  notificationsEnabled: boolean;
}

const defaultPreferences: Preferences = {
  selectedChat: "",
  sidebarOpen: true,
  notificationsEnabled: true,
};

const _usePreferences = () => {
  const selectedChat = useStorage<string>(
    "preferences.selectedChat",
    defaultPreferences.selectedChat,
  );

  const sidebarOpen = useStorage<boolean>(
    "preferences.sidebarOpen",
    defaultPreferences.sidebarOpen,
  );

  const notificationsEnabled = useStorage<boolean>(
    "preferences.notificationsEnabled",
    defaultPreferences.notificationsEnabled,
  );

  const setSelectedChat = (chatId: string) => {
    selectedChat.value = chatId;
  };

  const toggleSidebar = () => {
    sidebarOpen.value = !sidebarOpen.value;
  };

  const setSidebarOpen = (open: boolean) => {
    sidebarOpen.value = open;
  };

  const resetPreferences = () => {
    selectedChat.value = defaultPreferences.selectedChat;
    sidebarOpen.value = defaultPreferences.sidebarOpen;
    notificationsEnabled.value = defaultPreferences.notificationsEnabled;
  };

  return {
    // state
    selectedChat,
    sidebarOpen,
    notificationsEnabled,

    // actions
    setSelectedChat,
    toggleSidebar,
    setSidebarOpen,
    resetPreferences,
  };
};

export const usePreferences = createSharedComposable(_usePreferences);

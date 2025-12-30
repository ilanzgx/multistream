import { createSharedComposable, useStorage } from "@vueuse/core";

export interface Preferences {
  selectedChat: string;
  sidebarOpen: boolean;
}

const defaultPreferences: Preferences = {
  selectedChat: "",
  sidebarOpen: true,
};

const _usePreferences = () => {
  const selectedChat = useStorage<string>(
    "preferences.selectedChat",
    defaultPreferences.selectedChat
  );

  const sidebarOpen = useStorage<boolean>(
    "preferences.sidebarOpen",
    defaultPreferences.sidebarOpen
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
  };

  return {
    // state
    selectedChat,
    sidebarOpen,

    // actions
    setSelectedChat,
    toggleSidebar,
    setSidebarOpen,
    resetPreferences,
  };
};

export const usePreferences = createSharedComposable(_usePreferences);

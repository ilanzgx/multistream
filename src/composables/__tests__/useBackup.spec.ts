import { effectScope, EffectScope } from "vue";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useBackup, validateBackupData } from "../useBackup";
import type { BackupData } from "../useBackup";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    locale: { value: "en" },
    t: (key: string) => key,
  }),
}));

describe("useBackup composable unit tests", () => {
  let scope: EffectScope;
  let backupComposable: ReturnType<typeof useBackup>;

  const validBackup: BackupData = {
    version: 1,
    app: "multistream",
    exportedAt: 1700000000000,
    streams: [
      { id: "1", channel: "twitch_streamer", platform: "twitch" },
      { id: "2", channel: "kick_streamer", platform: "kick" },
    ],
    favorites: [{ channel: "fav_streamer", platform: "youtube", addedAt: 1600000000000 }],
    recents: [{ channel: "recent_streamer", platform: "kick", addedAt: 1650000000000 }],
    preferences: {
      selectedChat: "twitch_streamer",
      sidebarOpen: false,
      notificationsEnabled: true,
      locale: "pt",
    },
    watchHistory: {
      "twitch:twitch_streamer": 120000,
    },
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    scope = effectScope();
    backupComposable = scope.run(() => useBackup())!;
  });

  afterEach(() => {
    scope?.stop();
    delete (globalThis as any).document;
  });

  describe("validateBackupData", () => {
    it("should validate a correct backup structure", () => {
      expect(validateBackupData(validBackup)).toBe(true);
    });

    it("should reject backup with missing fields or wrong app name", () => {
      const invalidApp = { ...validBackup, app: "other_app" as any };
      expect(validateBackupData(invalidApp)).toBe(false);

      const invalidVersion = { ...validBackup, version: "1" as any };
      expect(validateBackupData(invalidVersion)).toBe(false);
    });

    it("should reject backup with invalid streams structure", () => {
      const invalidStreams = {
        ...validBackup,
        streams: [{ id: "1", channel: "invalid", platform: "invalid_platform" as any }],
      };
      expect(validateBackupData(invalidStreams)).toBe(false);
    });

    it("should reject backup with invalid preferences structure", () => {
      const invalidPreferences = {
        ...validBackup,
        preferences: { sidebarOpen: "yes" } as any, // should be boolean
      };
      expect(validateBackupData(invalidPreferences)).toBe(false);
    });

    it("should reject backup with invalid locale", () => {
      // Arrange
      const invalidLocale = {
        ...validBackup,
        preferences: { ...validBackup.preferences, locale: 123 } as any,
      };

      // Act & Assert
      expect(validateBackupData(invalidLocale)).toBe(false);
    });

    it("should reject backup with invalid watchHistory structure", () => {
      // Arrange
      const invalidHistory = {
        ...validBackup,
        watchHistory: { "twitch:streamer": "100" } as any, // should be number
      };

      const invalidHistoryArray = {
        ...validBackup,
        watchHistory: [] as any, // should be object
      };

      // Act & Assert
      expect(validateBackupData(invalidHistory)).toBe(false);
      expect(validateBackupData(invalidHistoryArray)).toBe(false);
    });
  });

  describe("importConfig", () => {
    it("should import data into all local storage keys correctly", () => {
      // Arrange
      const {
        importConfig,
        streams,
        favorites,
        recents,
        selectedChat,
        sidebarOpen,
        notificationsEnabled,
        watchHistory,
      } = backupComposable;

      // Act
      importConfig(validBackup);

      // Assert
      expect(streams.value).toEqual(validBackup.streams);
      expect(favorites.value).toEqual(validBackup.favorites);
      expect(recents.value).toEqual(validBackup.recents);
      expect(selectedChat.value).toBe("twitch_streamer");
      expect(sidebarOpen.value).toBe(false);
      expect(notificationsEnabled.value).toBe(true);
      expect(localStorage.getItem("locale")).toBe("pt");
      expect(watchHistory.value).toEqual(validBackup.watchHistory);
    });
  });

  describe("exportConfig", () => {
    it("should package data and trigger a file download", async () => {
      const {
        exportConfig,
        streams,
        favorites,
        recents,
        selectedChat,
        sidebarOpen,
        notificationsEnabled,
        watchHistory,
      } = backupComposable;

      // Populate some test data
      // Arrange
      streams.value = validBackup.streams;
      favorites.value = validBackup.favorites;
      recents.value = validBackup.recents;
      selectedChat.value = validBackup.preferences.selectedChat;
      sidebarOpen.value = validBackup.preferences.sidebarOpen;
      notificationsEnabled.value = validBackup.preferences.notificationsEnabled;
      if (validBackup.watchHistory) {
        watchHistory.value = validBackup.watchHistory;
      }

      // Mock DOM methods used in download on globalThis.document
      const clickMock = vi.fn();
      const mockLink = {
        setAttribute: vi.fn(),
        click: clickMock,
        remove: vi.fn(),
        href: "",
        download: "",
      };

      globalThis.document = {
        createElement: vi.fn().mockImplementation((tag) => {
          if (tag === "a") return mockLink;
          return {};
        }),
        body: {
          appendChild: vi.fn().mockImplementation((el) => el),
          removeChild: vi.fn().mockImplementation((el) => el),
        },
      } as any;

      const createObjectURLMock = vi.fn(() => "blob:url");
      const revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLMock;
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;

      // Act
      await exportConfig();

      // Assert
      expect(document.createElement).toHaveBeenCalledWith("a");
      expect(document.body.appendChild).toHaveBeenCalledWith(mockLink);
      expect(clickMock).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalledWith(mockLink);
      expect(createObjectURLMock).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:url");
    });

    it("should use showSaveFilePicker if available", async () => {
      // Arrange
      const { exportConfig } = backupComposable;

      const mockWritable = {
        write: vi.fn(),
        close: vi.fn(),
      };
      const mockHandle = {
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      };

      (globalThis as any).window = {
        showSaveFilePicker: vi.fn().mockResolvedValue(mockHandle),
      };

      // Act
      const result = await exportConfig();

      // Assert
      expect(result).toBe(true);
      expect((globalThis as any).window.showSaveFilePicker).toHaveBeenCalled();
      expect(mockHandle.createWritable).toHaveBeenCalled();
      expect(mockWritable.write).toHaveBeenCalled();
      expect(mockWritable.close).toHaveBeenCalled();

      delete (globalThis as any).window;
    });

    it("should handle AbortError from showSaveFilePicker", async () => {
      // Arrange
      const { exportConfig } = backupComposable;

      const abortError = new Error("AbortError");
      abortError.name = "AbortError";

      (globalThis as any).window = {
        showSaveFilePicker: vi.fn().mockRejectedValue(abortError),
      };

      // Act
      const result = await exportConfig();

      // Assert - Should return false if user cancelled
      expect(result).toBe(false);

      delete (globalThis as any).window;
    });
  });
});

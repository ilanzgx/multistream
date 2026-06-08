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
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    backupComposable = useBackup();
  });

  afterEach(() => {
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
  });

  describe("importConfig", () => {
    it("should import data into all local storage keys correctly", () => {
      // Arrange
      const { importConfig, streams, favorites, recents, selectedChat, sidebarOpen, notificationsEnabled } = backupComposable;

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
    });
  });

  describe("exportConfig", () => {
    it("should package data and trigger a file download", () => {
      const { exportConfig, streams, favorites, recents, selectedChat, sidebarOpen, notificationsEnabled } = backupComposable;

      // Populate some test data
      // Arrange
      streams.value = validBackup.streams;
      favorites.value = validBackup.favorites;
      recents.value = validBackup.recents;
      selectedChat.value = validBackup.preferences.selectedChat;
      sidebarOpen.value = validBackup.preferences.sidebarOpen;
      notificationsEnabled.value = validBackup.preferences.notificationsEnabled;

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
      exportConfig();

      // Assert
      expect(document.createElement).toHaveBeenCalledWith("a");
      expect(document.body.appendChild).toHaveBeenCalledWith(mockLink);
      expect(clickMock).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalledWith(mockLink);
      expect(createObjectURLMock).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:url");
    });
  });
});

import { describe, it, expect } from "vitest";
import { API_CONFIG } from "../api";

describe("api config URL generators unit tests", () => {
  describe("Kick API endpoints", () => {
    it("should generate and encode apiV1Url properly", () => {
      // Arrange
      const channel = "special channel#1";

      // Act
      const url = API_CONFIG.kick.apiV1Url(channel);

      // Assert
      expect(url).toBe("https://kick.com/api/v1/channels/special%20channel%231");
    });

    it("should generate and encode apiV2Url properly", () => {
      // Arrange
      const channel = "xqc";

      // Act
      const url = API_CONFIG.kick.apiV2Url(channel);

      // Assert
      expect(url).toBe("https://kick.com/api/v2/channels/xqc");
    });

    it("should generate and encode emotesUrl properly", () => {
      // Arrange
      const channel = "c++";

      // Act
      const url = API_CONFIG.kick.emotesUrl(channel);

      // Assert
      expect(url).toBe("https://kick.com/emotes/c%2B%2B");
    });
  });

  describe("7TV API endpoints", () => {
    it("should generate and encode twitchUserEmotesUrl properly", () => {
      // Arrange
      const userId = "181077473";

      // Act
      const url = API_CONFIG.sevenTv.twitchUserEmotesUrl(userId);

      // Assert
      expect(url).toBe("https://7tv.io/v3/users/twitch/181077473");
    });

    it("should generate and encode kickUserEmotesUrl properly", () => {
      // Arrange
      const channelSlug = "streamer/slug";

      // Act
      const url = API_CONFIG.sevenTv.kickUserEmotesUrl(channelSlug);

      // Assert
      expect(url).toBe("https://7tv.io/v3/users/kick/streamer%2Fslug");
    });
  });

  describe("BTTV API endpoints", () => {
    it("should generate and encode twitchUserEmotesUrl properly", () => {
      // Arrange
      const userId = "54fa8f14";

      // Act
      const url = API_CONFIG.bttv.twitchUserEmotesUrl(userId);

      // Assert
      expect(url).toBe("https://api.betterttv.net/3/cached/users/twitch/54fa8f14");
    });
  });

  describe("DecAPI endpoints", () => {
    it("should generate and encode twitchIdUrl properly", () => {
      // Arrange
      const username = "gaules";

      // Act
      const url = API_CONFIG.decapi.twitchIdUrl(username);

      // Assert
      expect(url).toBe("https://decapi.me/twitch/id/gaules");
    });

    it("should generate and encode twitchAvatarUrl properly", () => {
      // Arrange
      const username = "streamer test";

      // Act
      const url = API_CONFIG.decapi.twitchAvatarUrl(username);

      // Assert
      expect(url).toBe("https://decapi.me/twitch/avatar/streamer%20test");
    });
  });
});

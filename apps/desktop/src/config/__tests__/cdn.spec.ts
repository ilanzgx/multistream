import { describe, it, expect } from "vitest";
import { CDN_CONFIG } from "../cdn";

describe("cdn config templates unit tests", () => {
  describe("7TV CDN template", () => {
    it("should generate 7TV WebP emote URL with default 1x scale", () => {
      // Arrange
      const emoteId = "01FCY771D800007PQ2DF3GDTN6";

      // Act
      const url = CDN_CONFIG.sevenTv.emote(emoteId);

      // Assert
      expect(url).toBe("https://cdn.7tv.app/emote/01FCY771D800007PQ2DF3GDTN6/1x.webp");
    });

    it("should generate 7TV WebP emote URL with custom scale", () => {
      // Arrange
      const emoteId = "01FCY771D800007PQ2DF3GDTN6";

      // Act
      const url = CDN_CONFIG.sevenTv.emote(emoteId, "2x");

      // Assert
      expect(url).toBe("https://cdn.7tv.app/emote/01FCY771D800007PQ2DF3GDTN6/2x.webp");
    });
  });

  describe("BTTV CDN template", () => {
    it("should generate BTTV emote URL with default 1x scale", () => {
      // Arrange
      const emoteId = "54fa8f1401e468494b85b537";

      // Act
      const url = CDN_CONFIG.bttv.emote(emoteId);

      // Assert
      expect(url).toBe("https://cdn.betterttv.net/emote/54fa8f1401e468494b85b537/1x");
    });

    it("should generate BTTV emote URL with custom 3x scale", () => {
      // Arrange
      const emoteId = "54fa8f1401e468494b85b537";

      // Act
      const url = CDN_CONFIG.bttv.emote(emoteId, "3x");

      // Assert
      expect(url).toBe("https://cdn.betterttv.net/emote/54fa8f1401e468494b85b537/3x");
    });
  });

  describe("Twitch CDN templates", () => {
    it("should generate standard Twitch emote URL", () => {
      // Arrange
      const emoteId = "25";

      // Act
      const url = CDN_CONFIG.twitch.emote(emoteId);

      // Assert
      expect(url).toBe("https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0");
    });

    it("should generate preview thumbnail URL normalized to lowercase", () => {
      // Arrange
      const channel = "Gaules";

      // Act
      const url = CDN_CONFIG.twitch.previewThumbnail(channel);

      // Assert
      expect(url).toBe("https://static-cdn.jtvnw.net/previews-ttv/live_user_gaules-320x180.jpg");
    });
  });

  describe("Kick CDN template", () => {
    it("should generate Kick fullsize emote URL", () => {
      // Arrange
      const emoteId = "123456";

      // Act
      const url = CDN_CONFIG.kick.emote(emoteId);

      // Assert
      expect(url).toBe("https://files.kick.com/emotes/123456/fullsize");
    });
  });

  describe("UI-Avatars fallback template", () => {
    it("should encode displayName parameter properly", () => {
      // Arrange
      const name = "Streamer Master";

      // Act
      const url = CDN_CONFIG.avatarFallback(name);

      // Assert
      expect(url).toBe("https://ui-avatars.com/api/?name=Streamer%20Master&background=random");
    });
  });
});

import { describe, it, expect } from "vitest";
import { buildShareUrl, formatStreamIdentifier } from "../shareUrl";
import type { Stream } from "@/composables/useStreams";

describe("shareUrl", () => {
  describe("formatStreamIdentifier", () => {
    it("should preserve unique video ID for YouTube streams even when handle and displayName are present", () => {
      // Arrange
      const stream: Stream = {
        id: "stream-1",
        channel: "s4x8TqfN1kU",
        platform: "youtube",
        displayName: "CazéTV",
        handle: "CazeTV",
      };

      // Act
      const result = formatStreamIdentifier(stream);

      // Assert
      expect(result).toBe("youtube:s4x8TqfN1kU");
    });

    it("should preserve Twitch channel name using handle or displayName or channel", () => {
      // Arrange
      const stream: Stream = {
        id: "stream-2",
        channel: "gaules",
        platform: "twitch",
        displayName: "Gaules",
        handle: "gaules",
      };

      // Act
      const result = formatStreamIdentifier(stream);

      // Assert
      expect(result).toBe("twitch:gaules");
    });

    it("should preserve Kick channel name stripping leading @", () => {
      // Arrange
      const stream: Stream = {
        id: "stream-3",
        channel: "xqc",
        platform: "kick",
        handle: "@xqc",
      };

      // Act
      const result = formatStreamIdentifier(stream);

      // Assert
      expect(result).toBe("kick:xqc");
    });
  });

  describe("buildShareUrl", () => {
    it("should return null when streams list is empty", () => {
      // Arrange & Act
      const result = buildShareUrl({
        streams: [],
        locale: "pt",
      });

      // Assert
      expect(result).toBeNull();
    });

    it("should prevent duplicate channel handles when multiple concurrent YouTube streams exist from the same channel", () => {
      // Arrange: 4 simultaneous broadcasts of CazéTV with distinct video IDs
      const streams: Stream[] = [
        {
          id: "stream-caze-1",
          channel: "vid1_football",
          platform: "youtube",
          displayName: "CazéTV",
          handle: "CazeTV",
        },
        {
          id: "stream-caze-2",
          channel: "vid2_volleyball",
          platform: "youtube",
          displayName: "CazéTV",
          handle: "CazeTV",
        },
        {
          id: "stream-caze-3",
          channel: "vid3_gymnastics",
          platform: "youtube",
          displayName: "CazéTV",
          handle: "CazeTV",
        },
        {
          id: "stream-caze-4",
          channel: "vid4_skate",
          platform: "youtube",
          displayName: "CazéTV",
          handle: "CazeTV",
        },
      ];

      // Act
      const result = buildShareUrl({
        streams,
        locale: "pt-br",
        baseUrl: "https://usemultistream.vercel.app",
      });

      // Assert
      expect(result).toBe(
        "https://usemultistream.vercel.app/pt-br/?action=share&streams=youtube:vid1_football,youtube:vid2_volleyball,youtube:vid3_gymnastics,youtube:vid4_skate"
      );
    });

    it("should correctly serialize mixed platforms with Twitch, Kick, YouTube, and custom streams", () => {
      // Arrange
      const streams: Stream[] = [
        {
          id: "1",
          channel: "gaules",
          platform: "twitch",
        },
        {
          id: "2",
          channel: "xqc",
          platform: "kick",
        },
        {
          id: "3",
          channel: "s4x8TqfN1kU",
          platform: "youtube",
          displayName: "Canal GOAT",
          handle: "canalgoatbr",
        },
        {
          id: "4",
          channel: "Custom Server",
          platform: "custom",
          iframeUrl: "https://mysite.com/embed",
        },
      ];

      // Act
      const result = buildShareUrl({
        streams,
        locale: "en",
        baseUrl: "https://usemultistream.vercel.app",
      });

      // Assert
      expect(result).toContain("action=share");
      expect(result).toContain("streams=twitch:gaules,kick:xqc,youtube:s4x8TqfN1kU");
      expect(result).toContain("&c=");
      expect(result?.startsWith("https://usemultistream.vercel.app/en/")).toBe(true);
    });

    it("should map pt and pt-br locales to pt-br, and others to en", () => {
      // Arrange
      const streams: Stream[] = [
        {
          id: "1",
          channel: "gaules",
          platform: "twitch",
        },
      ];

      // Act & Assert
      const ptResult = buildShareUrl({
        streams,
        locale: "pt",
        baseUrl: "https://usemultistream.vercel.app",
      });
      expect(ptResult).toContain("/pt-br/?");

      const ptBrResult = buildShareUrl({
        streams,
        locale: "pt-br",
        baseUrl: "https://usemultistream.vercel.app",
      });
      expect(ptBrResult).toContain("/pt-br/?");

      const enResult = buildShareUrl({
        streams,
        locale: "en",
        baseUrl: "https://usemultistream.vercel.app",
      });
      expect(enResult).toContain("/en/?");

      const deResult = buildShareUrl({
        streams,
        locale: "de",
        baseUrl: "https://usemultistream.vercel.app",
      });
      expect(deResult).toContain("/en/?");
    });
  });
});

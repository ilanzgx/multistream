import { describe, it, expect } from "vitest";
import { parseStreamUrl } from "../platformParser";

describe("platformParser unit tests", () => {
  describe("Twitch URL parsing", () => {
    it("should parse standard twitch URL with https", () => {
      const result = parseStreamUrl("https://twitch.tv/ninja");
      expect(result).toEqual({ platform: "twitch", channel: "ninja" });
    });

    it("should parse twitch URL with www and http", () => {
      const result = parseStreamUrl("http://www.twitch.tv/gaules");
      expect(result).toEqual({ platform: "twitch", channel: "gaules" });
    });

    it("should parse twitch URL with subdomains like mobile", () => {
      const result = parseStreamUrl("https://m.twitch.tv/shroud");
      expect(result).toEqual({ platform: "twitch", channel: "shroud" });
    });

    it("should parse twitch URL without protocol", () => {
      const result = parseStreamUrl("twitch.tv/lck");
      expect(result).toEqual({ platform: "twitch", channel: "lck" });
    });

    it("should extract only the channel name from sub-paths", () => {
      const result = parseStreamUrl("https://twitch.tv/ninja/clip/SomeClipHere");
      expect(result).toEqual({ platform: "twitch", channel: "ninja" });
    });

    it("should ignore query parameters and hashes", () => {
      const result = parseStreamUrl("twitch.tv/ninja?referrer=twitter#about");
      expect(result).toEqual({ platform: "twitch", channel: "ninja" });
    });
  });

  describe("Kick URL parsing", () => {
    it("should parse standard kick URL", () => {
      const result = parseStreamUrl("https://kick.com/alanzoka");
      expect(result).toEqual({ platform: "kick", channel: "alanzoka" });
    });

    it("should parse kick URL with www", () => {
      const result = parseStreamUrl("https://www.kick.com/westcol");
      expect(result).toEqual({ platform: "kick", channel: "westcol" });
    });

    it("should parse kick URL without protocol", () => {
      const result = parseStreamUrl("kick.com/xqc");
      expect(result).toEqual({ platform: "kick", channel: "xqc" });
    });

    it("should extract only the channel name from sub-paths like chatroom", () => {
      const result = parseStreamUrl("https://kick.com/xqc/chatroom");
      expect(result).toEqual({ platform: "kick", channel: "xqc" });
    });
  });

  describe("YouTube URL parsing", () => {
    it("should parse standard watch link", () => {
      const result = parseStreamUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(result).toEqual({ platform: "youtube", channel: "dQw4w9WgXcQ" });
    });

    it("should parse share link youtu.be", () => {
      const result = parseStreamUrl("https://youtu.be/dQw4w9WgXcQ");
      expect(result).toEqual({ platform: "youtube", channel: "dQw4w9WgXcQ" });
    });

    it("should parse youtu.be without protocol", () => {
      const result = parseStreamUrl("youtu.be/dQw4w9WgXcQ?t=10");
      expect(result).toEqual({ platform: "youtube", channel: "dQw4w9WgXcQ" });
    });

    it("should parse live stream URL", () => {
      const result = parseStreamUrl("https://youtube.com/live/dQw4w9WgXcQ");
      expect(result).toEqual({ platform: "youtube", channel: "dQw4w9WgXcQ" });
    });

    it("should parse embed URL", () => {
      const result = parseStreamUrl("https://www.youtube.com/embed/dQw4w9WgXcQ");
      expect(result).toEqual({ platform: "youtube", channel: "dQw4w9WgXcQ" });
    });

    it("should parse channel with handle @", () => {
      const result = parseStreamUrl("https://youtube.com/@cazetv");
      expect(result).toEqual({ platform: "youtube", channel: "@cazetv" });
    });

    it("should parse channel with c/", () => {
      const result = parseStreamUrl("https://www.youtube.com/c/cazetv");
      expect(result).toEqual({ platform: "youtube", channel: "cazetv" });
    });
  });

  describe("Custom URL parsing", () => {
    it("should treat non-standard domain URLs as custom platform", () => {
      const url = "https://player.vimeo.com/video/803623";
      const result = parseStreamUrl(url);
      expect(result).toEqual({
        platform: "custom",
        channel: "",
        iframeUrl: url,
      });
    });

    it("should support custom URL without protocol if it looks like a URL", () => {
      const result = parseStreamUrl("mycustomsite.org/stream/123");
      expect(result).toEqual({
        platform: "custom",
        channel: "",
        iframeUrl: "https://mycustomsite.org/stream/123",
      });
    });
  });

  describe("Non-URL text parsing", () => {
    it("should return null for plain channel names", () => {
      expect(parseStreamUrl("ninja")).toBeNull();
      expect(parseStreamUrl("gaules")).toBeNull();
      expect(parseStreamUrl("12345")).toBeNull();
    });

    it("should return null for empty or whitespace-only inputs", () => {
      expect(parseStreamUrl("")).toBeNull();
      expect(parseStreamUrl("   ")).toBeNull();
    });
  });
});

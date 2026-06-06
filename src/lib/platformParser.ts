import { PLATFORMS } from "../config/platforms";
import type { Platform } from "../composables/useStreams";

export interface ParseResult {
  platform: Platform;
  channel: string;
  iframeUrl?: string;
}

/**
 * Parses an input string. If it's a valid stream URL, it extracts the platform,
 * the channel name (or video ID), and for custom streams, the iframe URL.
 * Returns null if the input is not a URL.
 */
export function parseStreamUrl(input: string): ParseResult | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let urlString = trimmed;
  // If it doesn't start with http/https, try to prepend protocol if it looks like a URL
  if (!/^https?:\/\//i.test(urlString)) {
    if (urlString.includes(".") && urlString.includes("/")) {
      urlString = "https://" + urlString;
    } else {
      return null;
    }
  }

  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    // Match hostname against known platform domains
    let detectedPlatform: Platform | null = null;
    for (const key of Object.keys(PLATFORMS)) {
      const platform = PLATFORMS[key];
      if (
        platform &&
        platform.domains.some(
          (domain) => hostname === domain || hostname.endsWith("." + domain),
        )
      ) {
        detectedPlatform = platform.id as Platform;
        break;
      }
    }

    if (detectedPlatform === "twitch" || detectedPlatform === "kick") {
      const pathParts = url.pathname.split("/").filter(Boolean);
      // Twitch & Kick channel name is always the first path segment
      const channel = pathParts[0] || "";
      if (channel) {
        const cleanChannel = channel.split("?")[0] ?? channel;
        return {
          platform: detectedPlatform,
          channel: cleanChannel.split("#")[0] ?? cleanChannel,
        };
      }
    } else if (detectedPlatform === "youtube") {
      // YouTube share links: youtu.be/VIDEO_ID
      if (hostname === "youtu.be" || hostname.endsWith(".youtu.be")) {
        const pathParts = url.pathname.split("/").filter(Boolean);
        const videoId = pathParts[0] || "";
        if (videoId) {
          return {
            platform: "youtube",
            channel: videoId,
          };
        }
      }

      // YouTube standard video URLs: youtube.com/watch?v=VIDEO_ID
      const videoId = url.searchParams.get("v");
      if (videoId) {
        return {
          platform: "youtube",
          channel: videoId,
        };
      }

      const pathParts = url.pathname.split("/").filter(Boolean);

      // YouTube live/embed links: youtube.com/live/VIDEO_ID or youtube.com/embed/VIDEO_ID
      if (pathParts[0] === "live" || pathParts[0] === "embed") {
        const id = pathParts[1] || "";
        if (id) {
          return {
            platform: "youtube",
            channel: id,
          };
        }
      }

      // YouTube handle channels: youtube.com/@channel
      if (pathParts[0] && pathParts[0].startsWith("@")) {
        return {
          platform: "youtube",
          channel: pathParts[0],
        };
      }

      // Fallback to the last part of path
      const fallback = pathParts[pathParts.length - 1];
      if (fallback) {
        return {
          platform: "youtube",
          channel: fallback,
        };
      }
    } else {
      // Valid URL but not matching Twitch/Kick/YouTube -> custom stream
      return {
        platform: "custom",
        channel: "",
        iframeUrl: url.toString(),
      };
    }
  } catch {
    return null;
  }

  return null;
}

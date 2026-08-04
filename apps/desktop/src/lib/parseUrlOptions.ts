import type { Platform } from "../composables/useStreams";

export interface ParsedStream {
  channel: string;
  platform: Platform;
  iframeUrl?: string;
}

export function parseUrlOptions(queryString: string): ParsedStream[] | null {
  const urlParams = new URLSearchParams(queryString);
  const streamsParam = urlParams.get("streams");
  const customParam = urlParams.get("c");

  // if no params are present, return null
  if (!streamsParam && !customParam) {
    return null;
  }

  // create an empty array to store the results
  // contains channel, platform and iframeUrl (optional)
  const results: ParsedStream[] = [];

  // parse regular streams (kick, twitch, youtube)
  if (streamsParam) {
    const streamList = streamsParam.split(",");
    streamList.forEach((stream) => {
      const [platform, channel] = stream.split(":");
      if (platform && channel) {
        results.push({ channel, platform: platform as Platform });
      }
    });
  }

  // parse custom streams (iframe urls) base64 encoded for ""short"" urls
  // maybe a real database should be used better for this 1000%, but for now it's ok
  if (customParam) {
    let raw: any[];
    try {
      raw = JSON.parse(atob(customParam));
    } catch {
      throw new Error("Invalid custom streams payload");
    }

    if (!Array.isArray(raw)) {
      throw new Error("Invalid custom streams payload");
    }

    for (const s of raw) {
      if (!s?.u || typeof s.u !== "string") continue;

      try {
        const url = new URL(s.u);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          throw new Error("Invalid protocol");
        }
      } catch {
        throw new Error("Invalid custom stream URL: " + s.u.slice(0, 50));
      }

      results.push({
        channel: s.n && typeof s.n === "string" ? s.n : "Custom Stream",
        platform: "custom",
        iframeUrl: s.u,
      });
    }
  }

  return results;
}

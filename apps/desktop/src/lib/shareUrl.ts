import { encodeBase64 } from "@/lib/base64";
import { APP_LINKS } from "@/config/links";
import type { Stream, Platform } from "@/composables/useStreams";
import type { LiveStatus } from "@/composables/useLiveStatus";

export interface BuildShareUrlOptions {
  streams: Stream[];
  locale: string;
  baseUrl?: string;
  getStatus?: (channel: string, platform: Platform) => LiveStatus | null | undefined;
}

export function formatStreamIdentifier(
  s: Stream,
  getStatus?: (channel: string, platform: Platform) => LiveStatus | null | undefined
): string {
  if (s.platform === "youtube") {
    return `youtube:${s.channel.replace(/^@+/, "").trim()}`;
  }

  const status = getStatus ? getStatus(s.displayName || s.channel, s.platform) : undefined;
  const identifier = (s.handle || status?.handle || s.displayName || s.channel)
    .replace(/^@+/, "")
    .trim();

  return `${s.platform}:${identifier}`;
}

export function buildShareUrl({
  streams,
  locale,
  baseUrl,
  getStatus,
}: BuildShareUrlOptions): string | null {
  if (!streams.length) {
    return null;
  }

  const resolvedBaseUrl =
    baseUrl ||
    (typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "tauri.localhost")
      ? APP_LINKS.website
      : typeof window !== "undefined"
        ? window.location.origin
        : APP_LINKS.website);

  const websiteLocale = locale === "pt" || locale === "pt-br" ? "pt-br" : "en";
  const url = `${resolvedBaseUrl}/${websiteLocale}/`;
  const params: string[] = ["action=share"];

  // regular streams (kick, twitch, youtube)
  const regularStreams = streams.filter((s) => s.platform !== "custom");
  if (regularStreams.length) {
    const streamsParam = regularStreams.map((s) => formatStreamIdentifier(s, getStatus)).join(",");
    params.push(`streams=${streamsParam}`);
  }

  // custom streams - Base64 encoded
  const customStreams = streams.filter((s) => s.platform === "custom");
  if (customStreams.length) {
    const customData = customStreams.map((s) => ({
      n: s.channel,
      u: s.iframeUrl || "",
    }));
    params.push(`c=${encodeBase64(JSON.stringify(customData))}`);
  }

  return `${url}?${params.join("&")}`;
}

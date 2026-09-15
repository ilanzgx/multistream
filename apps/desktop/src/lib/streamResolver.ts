import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ParsedStream } from "./parseUrlOptions";
import type { Platform } from "@/composables/useStreams";

export interface ResolvedStream {
  channel: string;
  platform: Platform;
  iframeUrl?: string;
  displayName?: string;
  handle?: string;
}

export async function resolveStream(s: ParsedStream): Promise<ResolvedStream | null> {
  const cleanChannel = s.channel.replace(/^@+/, "").trim();
  if (!cleanChannel) return null;

  if (s.platform === "youtube") {
    const isVideoId = /^[a-zA-Z0-9_-]{11}$/.test(cleanChannel);
    if ((s.channel.startsWith("@") || !isVideoId) && isTauri()) {
      try {
        const liveId = await invoke<string | null>("youtube_resolve_live_id", {
          channelOrHandle: cleanChannel,
        });
        if (liveId) {
          return {
            channel: liveId,
            platform: "youtube",
            displayName: cleanChannel,
            handle: cleanChannel,
          };
        }
        return null;
      } catch {
        return null;
      }
    }
  }

  return {
    channel: cleanChannel,
    platform: s.platform,
    iframeUrl: s.iframeUrl,
  };
}

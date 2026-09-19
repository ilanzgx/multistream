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

export type StreamStatusGetter = (
  channel: string,
  platform: Platform
) => { displayName?: string; handle?: string } | null | undefined;

export async function resolveStream(
  s: ParsedStream,
  getStatus?: StreamStatusGetter
): Promise<ResolvedStream | null> {
  const cleanChannel = s.channel.replace(/^@+/, "").trim();
  if (!cleanChannel) return null;

  if (s.platform === "youtube") {
    if (isTauri()) {
      try {
        const liveId = await invoke<string | null>("youtube_resolve_live_id", {
          channelOrHandle: cleanChannel,
        });
        if (liveId) {
          const isInputVideoId = cleanChannel === liveId && !s.channel.startsWith("@");
          const matchedStatus = getStatus
            ? getStatus(cleanChannel, "youtube") || getStatus(liveId, "youtube")
            : undefined;

          const displayName =
            matchedStatus?.displayName || (isInputVideoId ? undefined : cleanChannel);
          const handle = matchedStatus?.handle
            ? matchedStatus.handle.replace(/^@+/, "")
            : isInputVideoId
              ? undefined
              : cleanChannel;

          return {
            channel: liveId,
            platform: "youtube",
            displayName,
            handle,
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

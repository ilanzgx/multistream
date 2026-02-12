import { ref, watch } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { useRecents } from "./useRecents";
import type { Platform } from "./useStreams";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const POLL_INTERVAL = 30000; // 30s

export interface LiveStatus {
  isLive: boolean;
  viewerCount?: number;
  title?: string;
  category?: string;
}

type StatusMap = Record<string, LiveStatus>;

const isTauri = () => "__TAURI__" in window;

async function httpGet(
  url: string,
  headers?: Record<string, string>,
): Promise<Response> {
  if (isTauri()) {
    return tauriFetch(url, { method: "GET", headers });
  }
  return fetch(url, { headers });
}

async function httpPost(
  url: string,
  body: string,
  headers?: Record<string, string>,
): Promise<Response> {
  if (isTauri()) {
    return tauriFetch(url, { method: "POST", body, headers });
  }
  return fetch(url, { method: "POST", body, headers });
}

// Twitch
async function checkTwitchStreams(channels: string[]): Promise<StatusMap> {
  const result: StatusMap = {};
  if (channels.length === 0) return result;

  for (const ch of channels) {
    result[`twitch:${ch.toLowerCase()}`] = { isLive: false };
  }

  // Build a single request with multiple queries
  const query = channels
    .map(
      (ch, i) => `
    c${i}: user(login: "${ch.toLowerCase()}") {
      stream {
        title
        viewersCount
        game {
          displayName
        }
      }
    }
  `,
    )
    .join("\n");

  try {
    const response = await httpPost(
      "https://gql.twitch.tv/gql",
      JSON.stringify({
        query: `{ ${query} }`,
      }),
      {
        // Public client ID used by the Twitch website
        // Not official, but works for years
        "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        "Content-Type": "application/json",
      },
    );

    if (!response.ok) return result;

    const data = await response.json();

    if (data?.data) {
      channels.forEach((ch, i) => {
        const key = `twitch:${ch.toLowerCase()}`;
        const userData = data.data[`c${i}`];

        if (userData?.stream) {
          result[key] = {
            isLive: true,
            viewerCount: userData.stream.viewersCount,
            title: userData.stream.title,
            category: userData.stream.game?.displayName,
          };
        }
      });
    }
  } catch {
    // silently fail
  }

  return result;
}

// Kick
async function checkKickStreams(channels: string[]): Promise<StatusMap> {
  const result: StatusMap = {};
  if (channels.length === 0) return result;

  for (const ch of channels) {
    result[`kick:${ch.toLowerCase()}`] = { isLive: false };
  }

  const promises = channels.map(async (channel) => {
    try {
      const response = await httpGet(
        `https://kick.com/api/v2/channels/${encodeURIComponent(channel)}`,
      );

      if (!response.ok) return;

      const data = await response.json();
      const key = `kick:${channel.toLowerCase()}`;

      if (data?.livestream) {
        result[key] = {
          isLive: true,
          viewerCount: data.livestream.viewer_count,
          title: data.livestream.session_title,
          category: data.livestream.categories?.[0]?.name,
        };
      }
    } catch {
      // silently fail
    }
  });

  await Promise.allSettled(promises);
  return result;
}

// --- Composable ---
const _useLiveStatus = () => {
  const { recents } = useRecents();
  const statuses = ref<StatusMap>({});
  const isChecking = ref(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const checkAll = async () => {
    if (isChecking.value) return;

    const twitchChannels: string[] = [];
    const kickChannels: string[] = [];

    for (const recent of recents.value) {
      if (recent.platform === "twitch") {
        twitchChannels.push(recent.channel);
      } else if (recent.platform === "kick") {
        kickChannels.push(recent.channel);
      }
    }

    if (twitchChannels.length === 0 && kickChannels.length === 0) {
      statuses.value = {};
      return;
    }

    isChecking.value = true;

    try {
      const [twitchResults, kickResults] = await Promise.allSettled([
        checkTwitchStreams(twitchChannels),
        checkKickStreams(kickChannels),
      ]);

      const newStatuses: StatusMap = {};

      if (twitchResults.status === "fulfilled") {
        Object.assign(newStatuses, twitchResults.value);
      }
      if (kickResults.status === "fulfilled") {
        Object.assign(newStatuses, kickResults.value);
      }

      statuses.value = newStatuses;
    } finally {
      isChecking.value = false;
    }
  };

  const getStatus = (
    channel: string,
    platform: Platform,
  ): LiveStatus | null => {
    if (platform !== "twitch" && platform !== "kick") return null;
    const key = `${platform}:${channel.toLowerCase()}`;
    return statuses.value[key] ?? null;
  };

  const startPolling = () => {
    if (intervalId) return;
    checkAll();
    intervalId = setInterval(checkAll, POLL_INTERVAL);
  };

  const stopPolling = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  // Re-check when recents change
  watch(
    () => recents.value.length,
    () => checkAll(),
  );

  return {
    statuses,
    isChecking,
    getStatus,
    startPolling,
    stopPolling,
    checkAll,
  };
};

export const useLiveStatus = createSharedComposable(_useLiveStatus);

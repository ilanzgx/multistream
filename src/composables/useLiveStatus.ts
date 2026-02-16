import { ref, watch } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { useRecents } from "./useRecents";
import type { Platform } from "./useStreams";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const POLL_INTERVAL = 30000; // 30s
const MAX_KICK_PAGES = 3;

export interface LiveStatus {
  isLive: boolean;
  viewerCount?: number;
  title?: string;
  category?: string;
}

export interface SuggestedStream {
  channel: string;
  platform: Platform;
  title: string;
  category: string;
  viewerCount: number;
  thumbnail?: string;
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

async function fetchTwitchSuggestions(
  limit: number = 6,
): Promise<SuggestedStream[]> {
  try {
    const query = `
      query {
        streams(first: ${limit}, options: {sort: VIEWER_COUNT}) {
          edges {
            node {
              broadcaster { login }
              title
              viewersCount
              game { displayName }
              previewImageURL(width: 640, height: 360)
            }
          }
        }
      }
    `;

    const response = await httpPost(
      "https://gql.twitch.tv/gql",
      JSON.stringify({ query }),
      {
        "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        "Content-Type": "application/json",
      },
    );

    if (!response.ok) return [];
    const data = await response.json();

    return (
      data.data?.streams?.edges?.map((edge: any) => ({
        channel: edge.node.broadcaster.login,
        platform: "twitch" as Platform,
        title: edge.node.title,
        category: edge.node.game?.displayName || "Just Chatting",
        viewerCount: edge.node.viewersCount,
        thumbnail: edge.node.previewImageURL,
      })) || []
    );
  } catch {
    return [];
  }
}

// async function fetchAllKickStreams(): Promise<any[]> {
//   const allStreams: any[] = [];
//   let page = 1;

//   while (page <= MAX_KICK_PAGES) {
//     const res = await httpGet(
//       `https://kick.com/stream/featured-livestreams/en?page=${page}`,
//     );
//     if (!res.ok) break;

//     const data = await res.json();
//     console.log(data);
//     allStreams.push(...(data.data ?? []));

//     if (!data.next_page_url) break;

//     page++;
//   }

//   return allStreams;
// }

async function fetchAllKickStreams(): Promise<any[]> {
  const requests = Array.from({ length: MAX_KICK_PAGES }, (_, i) =>
    httpGet(`https://kick.com/stream/featured-livestreams/en?page=${i + 1}`),
  );

  const responses = await Promise.all(requests);

  const allStreams: any[] = [];
  for (const res of responses) {
    if (!res.ok) continue;
    const data = await res.json();
    allStreams.push(...(data.data ?? []));
  }

  // check if have duplicate streams
  const seen = new Set<string>();
  return allStreams.filter((s) => {
    const key = s.channel?.slug ?? s.slug;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchKickSuggestions(
  limit: number = 6,
): Promise<SuggestedStream[]> {
  try {
    const allStreams = await fetchAllKickStreams();
    console.log(allStreams);

    return allStreams
      .sort(
        (a, b) =>
          (b.viewer_count ?? b.viewers ?? 0) -
          (a.viewer_count ?? a.viewers ?? 0),
      )
      .slice(0, limit)
      .map((s: any) => ({
        channel: s.channel?.slug || s.slug,
        platform: "kick" as Platform,
        title: s.session_title || s.title || "",
        category:
          s.categories?.[0]?.name ?? s.category?.name ?? "Just Chatting",
        viewerCount: s.viewer_count ?? s.viewers ?? 0,
        thumbnail: s.thumbnail?.src || s.thumbnail?.url,
      }));
  } catch {
    return [];
  }
}

// --- Composable ---
const _useLiveStatus = () => {
  const { recents } = useRecents();
  const statuses = ref<StatusMap>({});
  const suggestedStreams = ref<SuggestedStream[]>([]);
  const isChecking = ref(false);
  const isLoadingSuggestions = ref(false);
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

  const refreshSuggestions = async () => {
    if (isLoadingSuggestions.value) return;
    isLoadingSuggestions.value = true;

    try {
      const [twitch, kick] = await Promise.all([
        fetchTwitchSuggestions(6),
        fetchKickSuggestions(6),
      ]);

      const combined: SuggestedStream[] = [];
      const maxLength = Math.max(twitch.length, kick.length);

      for (let i = 0; i < maxLength; i++) {
        const t = twitch[i];
        if (t) combined.push(t);

        const k = kick[i];
        if (k) combined.push(k);
      }

      suggestedStreams.value = combined;
    } finally {
      isLoadingSuggestions.value = false;
    }
  };

  return {
    statuses,
    suggestedStreams,
    isChecking,
    isLoadingSuggestions,
    getStatus,
    startPolling,
    stopPolling,
    checkAll,
    refreshSuggestions,
  };
};

export const useLiveStatus = createSharedComposable(_useLiveStatus);

import { ref, watch } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { useRecents } from "./useRecents";
import { useFavorites } from "./useFavorites";
import type { Platform } from "./useStreams";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { API_CONFIG, REFRESH_CONFIG } from "@/config/api";
import { SUPPORTED_LANGUAGES, DEFAULT_LOCALE } from "@/config/i18n";

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
      API_CONFIG.twitch.gqlUrl,
      JSON.stringify({
        query: `{ ${query} }`,
      }),
      {
        // Public client ID used by the Twitch website
        // Not official, but works for years
        "Client-Id": API_CONFIG.twitch.clientId,
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
        `${API_CONFIG.kick.apiBaseUrl}/${encodeURIComponent(channel)}`,
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
  limit: number = REFRESH_CONFIG.suggestionsLimit,
): Promise<SuggestedStream[]> {
  try {
    const locale = localStorage.getItem("locale") ?? DEFAULT_LOCALE;
    const twitchLanguage =
      SUPPORTED_LANGUAGES[locale]?.apiCodes.twitch ??
      SUPPORTED_LANGUAGES[DEFAULT_LOCALE]!.apiCodes.twitch;

    const query = `
      query {
        streams(first: 30, options: {sort: VIEWER_COUNT}) {
          edges {
            node {
              broadcaster { login, broadcastSettings { language } }
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
      API_CONFIG.twitch.gqlUrl,
      JSON.stringify({ query }),
      {
        "Client-Id": API_CONFIG.twitch.clientId,
        "Content-Type": "application/json",
      },
    );

    if (!response.ok) return [];
    const data = await response.json();

    const allStreams =
      data.data?.streams?.edges?.map((edge: any) => ({
        channel: edge.node.broadcaster.login,
        platform: "twitch" as Platform,
        title: edge.node.title,
        category: edge.node.game?.displayName || "Just Chatting",
        viewerCount: edge.node.viewersCount,
        language: edge.node.broadcaster.broadcastSettings?.language ?? "en",
        thumbnail: edge.node.previewImageURL,
      })) ?? [];

    const filtered = allStreams.filter(
      (s: any) => s.language === twitchLanguage,
    );

    const result = [
      ...filtered,
      ...allStreams.filter((s: any) => s.language !== twitchLanguage),
    ]
      .slice(0, limit)
      .map(({ language, ...s }: any) => s);

    return result.slice(0, limit).map(({ language, ...s }: any) => s);
  } catch {
    return [];
  }
}

async function fetchAllKickStreams(): Promise<any[]> {
  const locale = localStorage.getItem("locale") ?? DEFAULT_LOCALE;
  const kickLanguage =
    SUPPORTED_LANGUAGES[locale]?.apiCodes.kick ??
    SUPPORTED_LANGUAGES[DEFAULT_LOCALE]!.apiCodes.kick;

  const requests = Array.from({ length: REFRESH_CONFIG.maxKickPages }, (_, i) =>
    httpGet(
      `${API_CONFIG.kick.featuredUrl}/${kickLanguage?.code}?page=${i + 1}`,
    ),
  );

  const responses = await Promise.all(requests);
  const allStreams: any[] = [];

  for (const res of responses) {
    if (!res.ok) continue;
    const data = await res.json();
    allStreams.push(...(data.data ?? []));
  }

  const filtered = allStreams.filter(
    (s) => s.language?.toLowerCase() === kickLanguage?.name.toLowerCase(),
  );

  // if there are not enough streams in the language, use all streams
  const streams = filtered.length >= 4 ? filtered : allStreams;

  // check if have duplicate streams
  const seen = new Set<string>();
  return streams.filter((s) => {
    const key = s.channel?.slug ?? s.slug;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchKickSuggestions(
  limit: number = REFRESH_CONFIG.suggestionsLimit,
): Promise<SuggestedStream[]> {
  try {
    const allStreams = await fetchAllKickStreams();

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
  const { favorites } = useFavorites();
  const statuses = ref<StatusMap>({});
  const suggestedStreams = ref<SuggestedStream[]>([]);
  const isChecking = ref(false);
  const isLoadingSuggestions = ref(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const checkAll = async () => {
    if (isChecking.value) return;

    const twitchSet = new Set<string>();
    const kickSet = new Set<string>();

    // Collect channels from both recents and favorites
    const allChannels = [...recents.value, ...favorites.value];

    for (const entry of allChannels) {
      if (entry.platform === "twitch") {
        twitchSet.add(entry.channel);
      } else if (entry.platform === "kick") {
        kickSet.add(entry.channel);
      }
    }

    const twitchChannels = [...twitchSet];
    const kickChannels = [...kickSet];

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
    intervalId = setInterval(checkAll, REFRESH_CONFIG.interval);
  };

  const stopPolling = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  // Re-check when recents or favorites change
  watch(
    () => recents.value.length + favorites.value.length,
    () => checkAll(),
  );

  const refreshSuggestions = async () => {
    if (isLoadingSuggestions.value) return;
    isLoadingSuggestions.value = true;

    try {
      const [twitch, kick] = await Promise.all([
        fetchTwitchSuggestions(REFRESH_CONFIG.suggestionsLimit),
        fetchKickSuggestions(REFRESH_CONFIG.suggestionsLimit),
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

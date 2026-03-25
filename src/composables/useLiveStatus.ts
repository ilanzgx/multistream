import { ref, watch } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { useRecents } from "./useRecents";
import { useFavorites } from "./useFavorites";
import { usePreferences } from "./usePreferences";
import type { Platform } from "./useStreams";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { i18n } from "@/i18n";

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

/**
 * @brief Check if the app is running in Tauri
 *
 * @return true if the app is running in Tauri, false otherwise
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * @brief HTTP GET request
 *
 * Sends an HTTP GET request to the given URL.
 *
 * @param url The URL to send the request to
 * @param headers The headers to send with the request
 * @return The response
 */
async function httpGet(
  url: string,
  headers?: Record<string, string>,
): Promise<Response> {
  if (isTauri()) {
    return tauriFetch(url, { method: "GET", headers });
  }
  return fetch(url, { headers });
}

/**
 * @brief HTTP POST request
 *
 * Sends an HTTP POST request to the given URL.
 *
 * @param url The URL to send the request to
 * @param body The body of the request
 * @param headers The headers to send with the request
 * @return The response
 */
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

/**
 * @brief Check Twitch streams
 *
 * Checks if the given channels are live on Twitch.
 * This function uses the Twitch GraphQL API to check if the given channels are live.
 * If the channel is live, it returns the viewer count, title, and category.
 *
 * @param channels The channels to check
 * @return The status of the channels
 */
async function checkTwitchStreams(
  channels: string[],
): Promise<StatusMap | null> {
  const result: StatusMap = {};
  if (channels.length === 0) return result;

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

    if (!response.ok) return null;

    const data = await response.json();

    if (!data?.data) return null;

    for (const ch of channels) {
      result[`twitch:${ch.toLowerCase()}`] = { isLive: false };
    }

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

    return result;
  } catch {
    return null;
  }
}

/**
 * @brief Fetch Twitch suggestions
 *
 * Fetches the top streams from Twitch using cursor-based pagination.
 * Pages of 30 streams are fetched until the desired limit is reached.
 * Results are sorted with the user's language first.
 *
 * @param limit The maximum number of suggestions to return
 * @return The suggestions
 */
async function fetchTwitchSuggestions(
  limit: number = REFRESH_CONFIG.suggestionsLimit,
): Promise<SuggestedStream[]> {
  try {
    const locale = localStorage.getItem("locale") ?? DEFAULT_LOCALE;
    const twitchLanguage =
      SUPPORTED_LANGUAGES[locale]?.apiCodes.twitch ??
      SUPPORTED_LANGUAGES[DEFAULT_LOCALE]!.apiCodes.twitch;

    const PAGE_SIZE = 30;
    const allStreams: any[] = [];
    let cursor: string | null = null;

    // fetch pages until we have enough streams or run out of results
    while (allStreams.length < limit) {
      const afterClause = cursor ? `, after: "${cursor}"` : "";
      const query = `
        query {
          streams(first: ${PAGE_SIZE}${afterClause}, options: {sort: VIEWER_COUNT}) {
            edges {
              cursor
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

      if (!response.ok) break;
      const data = await response.json();

      const edges = data.data?.streams?.edges ?? [];
      if (edges.length === 0) break;

      for (const edge of edges) {
        allStreams.push({
          channel: edge.node.broadcaster.login,
          platform: "twitch" as Platform,
          title: edge.node.title,
          category: edge.node.game?.displayName || "Just Chatting",
          viewerCount: edge.node.viewersCount,
          language: edge.node.broadcaster.broadcastSettings?.language ?? "en",
          thumbnail: edge.node.previewImageURL,
        });
      }

      cursor = edges[edges.length - 1]?.cursor ?? null;

      if (edges.length < PAGE_SIZE) break;
    }

    const filtered = allStreams.filter(
      (s: any) => s.language === twitchLanguage,
    );

    return [
      ...filtered,
      ...allStreams.filter((s: any) => s.language !== twitchLanguage),
    ]
      .slice(0, limit)
      .map(({ language, ...s }: any) => s);
  } catch {
    return [];
  }
}

/**
 * @brief Check Kick streams
 *
 * Checks if the given channels are live on Kick.
 *
 * @param channels The channels to check
 * @return The status of the channels
 */
async function checkKickStreams(channels: string[]): Promise<StatusMap | null> {
  const result: StatusMap = {};
  if (channels.length === 0) return result;

  let failedCount = 0;
  const promises = channels.map(async (channel) => {
    try {
      const response = await httpGet(
        `${API_CONFIG.kick.apiBaseUrl}/${encodeURIComponent(channel)}`,
      );

      if (!response.ok) {
        if (response.status !== 404) {
          failedCount++;
        } else {
          // 404 means offline/not found, which is a valid result
          result[`kick:${channel.toLowerCase()}`] = { isLive: false };
        }
        return;
      }

      const data = await response.json();
      const key = `kick:${channel.toLowerCase()}`;

      if (data?.livestream) {
        result[key] = {
          isLive: true,
          viewerCount: data.livestream.viewer_count,
          title: data.livestream.session_title,
          category: data.livestream.categories?.[0]?.name,
        };
      } else {
        result[key] = { isLive: false };
      }
    } catch {
      failedCount++;
    }
  });

  await Promise.allSettled(promises);

  // If all requests failed (and not due to 404), return null to indicate a network issue
  if (failedCount === channels.length && channels.length > 0) {
    return null;
  }

  return result;
}

/**
 * @brief Fetch all Kick streams
 *
 * Fetches all Kick streams.
 * This function fetches all Kick streams and returns them.
 * If there are not enough streams in the language, it uses all streams.
 * This for now gets only REFRESH_CONFIG.maxKickPages (3) pages. (08/03/2026)
 *
 * @return The streams
 */
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

/**
 * @brief Fetch Kick suggestions
 *
 * Fetches Kick suggestions.
 * Get the response from fetchAllKickStreams and returns the top limit streams.
 * If there are not enough streams in the language, it uses all streams.
 *
 * @param limit The number of suggestions to fetch
 * @return The suggestions
 */
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
  const { notificationsEnabled } = usePreferences();
  const statuses = ref<StatusMap>({});
  const previousStatuses = ref<StatusMap>({});
  const suggestedStreams = ref<SuggestedStream[]>([]);
  const isChecking = ref(false);
  const isLoadingSuggestions = ref(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * @brief Fetches and updates the live status for all tracked streams.
   *
   * The function aggregates channels from both `recents` and `favorites`,
   * deduplicates them by platform, and performs parallel requests to
   * the supported streaming services (Twitch and Kick).
   *
   * After retrieving the results, the internal `statuses` map is updated.
   * The previous state is compared with the new state to detect
   * offline → online transitions for favorite channels.
   *
   * When running inside a Tauri environment and notifications are enabled,
   * desktop notifications are triggered for streams that have just gone live.
   *
   * Re-entrant execution is prevented by the `isChecking` flag.
   *
   * @returns Promise<void>
   */
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
      previousStatuses.value = {};
      return;
    }

    isChecking.value = true;

    try {
      const [twitchResults, kickResults] = await Promise.allSettled([
        checkTwitchStreams(twitchChannels),
        checkKickStreams(kickChannels),
      ]);

      const newStatuses: StatusMap = { ...statuses.value };

      if (
        twitchResults.status === "fulfilled" &&
        twitchResults.value !== null
      ) {
        Object.assign(newStatuses, twitchResults.value);
      }
      if (kickResults.status === "fulfilled" && kickResults.value !== null) {
        Object.assign(newStatuses, kickResults.value);
      }

      // detect offline -> online transitions for favorites
      if (isTauri() && notificationsEnabled.value) {
        const t = i18n.global.t;
        const isFirstCheck = Object.keys(previousStatuses.value).length === 0;
        const newLiveChannels: { fav: any; status: any }[] = [];

        for (const fav of favorites.value) {
          if (fav.platform !== "twitch" && fav.platform !== "kick") continue;

          const key = `${fav.platform}:${fav.channel.toLowerCase()}`;
          const hadPreviousStatus = key in previousStatuses.value;
          const wasLive = previousStatuses.value[key]?.isLive ?? false;
          const isNowLive = newStatuses[key]?.isLive ?? false;

          // Only notify if:
          // 1. It's the first check (welcome notification)
          // 2. OR it was already being tracked and changed from offline to online
          if (isFirstCheck) {
            if (isNowLive) {
              newLiveChannels.push({ fav, status: newStatuses[key] });
            }
          } else if (hadPreviousStatus && !wasLive && isNowLive) {
            newLiveChannels.push({ fav, status: newStatuses[key] });
          }
        }

        if (newLiveChannels.length > 0) {
          // If many channels went live at once or it's the first check, consolidate notifications
          if (isFirstCheck || newLiveChannels.length > 3) {
            if (newLiveChannels.length === 1) {
              const { fav } = newLiveChannels[0]!;
              invoke("send_notification", {
                title: t("notifications.welcome"),
                body: t("notifications.welcomeBodySingle", {
                  channel: fav.channel,
                }),
              }).catch(() => {});
            } else {
              const names = newLiveChannels
                .map((c) => c.fav.channel)
                .join(", ");
              invoke("send_notification", {
                title: t("notifications.welcome"),
                body: t("notifications.welcomeBody", { channels: names }),
              }).catch(() => {});
            }
          } else {
            // Individual notifications for small number of updates
            for (const { fav, status } of newLiveChannels) {
              const title = t("notifications.live", { channel: fav.channel });
              let body: string;

              if (status?.title && status?.category) {
                body = t("notifications.liveBody", {
                  title: status.title,
                  category: status.category,
                });
              } else if (status?.title) {
                body = t("notifications.liveBodyTitleOnly", {
                  title: status.title,
                });
              } else {
                body = t("notifications.liveBodyFallback", {
                  channel: fav.channel,
                  platform: fav.platform,
                });
              }

              invoke("send_notification", { title, body }).catch(() => {});
            }
          }
        }
      }

      previousStatuses.value = { ...newStatuses };
      statuses.value = newStatuses;
    } finally {
      isChecking.value = false;
    }
  };

  /**
   * @brief Get status
   *
   * Gets the status of a stream.
   *
   * @param channel The channel to get the status of
   * @param platform The platform of the channel
   * @return The status of the stream
   */
  const getStatus = (
    channel: string,
    platform: Platform,
  ): LiveStatus | null => {
    if (platform !== "twitch" && platform !== "kick") return null;
    const key = `${platform}:${channel.toLowerCase()}`;
    return statuses.value[key] ?? null;
  };

  /**
   * @brief Check if there are channels to track
   */
  const hasChannels = () =>
    recents.value.some(
      (r) => r.platform === "twitch" || r.platform === "kick",
    ) ||
    favorites.value.some(
      (f) => f.platform === "twitch" || f.platform === "kick",
    );

  /**
   * @brief Start polling
   *
   * Starts the polling interval only if there are channels to track.
   * This makes the app check for new streams every REFRESH_CONFIG.interval milliseconds.
   *
   * @return void
   */
  const startPolling = () => {
    if (intervalId) return;
    if (!hasChannels()) return;
    checkAll();
    intervalId = setInterval(checkAll, REFRESH_CONFIG.interval);
  };

  /**
   * @brief Stop polling
   *
   * Stops the polling interval.
   * This makes the app stop checking for new streams.
   *
   * @return void
   */
  const stopPolling = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  // Debounced re-check: auto-start/stop polling when channels change
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  watch(
    () => recents.value.length + favorites.value.length,
    () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (hasChannels()) {
          if (!intervalId) startPolling();
          else checkAll();
        } else {
          stopPolling();
        }
      }, 1000);
    },
  );

  /**
   * @brief Refresh suggestions
   *
   * Refreshes the suggestions list.
   *
   * @return void
   */
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

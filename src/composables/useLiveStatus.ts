import { ref, watch, onScopeDispose } from "vue";
import { createSharedComposable, useDocumentVisibility } from "@vueuse/core";
import { useRecents } from "./useRecents";
import { useFavorites } from "./useFavorites";
import { usePreferences } from "./usePreferences";
import type { Platform } from "./useStreams";
import { invoke } from "@tauri-apps/api/core";
import { i18n } from "@/i18n";
import { isTauri, httpGet, httpPost } from "@/lib/http";

import { API_CONFIG, REFRESH_CONFIG } from "@/config/api";
import { SUPPORTED_LANGUAGES, DEFAULT_LOCALE } from "@/config/i18n";

export interface LiveStatus {
  isLive: boolean;
  viewerCount?: number;
  title?: string;
  category?: string;
  avatarUrl?: string;
  thumbnailUrl?: string;
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
 * @brief Check Twitch streams
 *
 * Checks if the given channels are live on Twitch.
 * This function uses the Twitch GraphQL API to check if the given channels are live.
 * If the channel is live, it returns the viewer count, title, and category.
 *
 * @param channels The channels to check
 * @return The status of the channels
 */
async function checkTwitchStreams(channels: string[]): Promise<StatusMap | null> {
  const result: StatusMap = {};
  if (channels.length === 0) return result;

  // Build a single request with multiple queries
  const query = channels
    .map(
      (ch, i) => `
    c${i}: user(login: "${ch.toLowerCase()}") {
      profileImageURL(width: 70)
      stream {
        title
        viewersCount
        game {
          displayName
        }
      }
    }
  `
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
      }
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
          avatarUrl: userData.profileImageURL,
          thumbnailUrl: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${ch.toLowerCase()}-320x180.jpg`,
        };
      } else if (userData?.profileImageURL) {
        result[key] = { isLive: false, avatarUrl: userData.profileImageURL };
      }
    });

    return result;
  } catch {
    return null;
  }
}

const TWITCH_PAGE_SIZE = 30;

/**
 * @brief Fetch a single page of Twitch suggestions
 *
 * Fetches one page of top streams from Twitch using cursor-based pagination.
 *
 * @param cursor The cursor from the previous page, or null for the first page
 * @param pageSize The number of streams per page
 * @return The streams and the cursor for the next page
 */
async function fetchTwitchSuggestionsPage(
  cursor: string | null,
  pageSize: number = TWITCH_PAGE_SIZE
): Promise<{ streams: any[]; nextCursor: string | null }> {
  try {
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const query = `
      query {
        streams(first: ${pageSize}${afterClause}, options: {sort: VIEWER_COUNT}) {
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

    const response = await httpPost(API_CONFIG.twitch.gqlUrl, JSON.stringify({ query }), {
      "Client-Id": API_CONFIG.twitch.clientId,
      "Content-Type": "application/json",
    });

    if (!response.ok) return { streams: [], nextCursor: null };
    const data = await response.json();

    const edges = data.data?.streams?.edges ?? [];
    if (edges.length === 0) return { streams: [], nextCursor: null };

    const streams = edges.map((edge: any) => ({
      channel: edge.node.broadcaster.login,
      platform: "twitch" as Platform,
      title: edge.node.title,
      category: edge.node.game?.displayName || "Just Chatting",
      viewerCount: edge.node.viewersCount,
      language: edge.node.broadcaster.broadcastSettings?.language ?? "en",
      thumbnail: edge.node.previewImageURL,
    }));

    const nextCursor = edges.length < pageSize ? null : (edges[edges.length - 1]?.cursor ?? null);

    return { streams, nextCursor };
  } catch {
    return { streams: [], nextCursor: null };
  }
}

/**
 * @brief Process raw Twitch streams into suggestions
 *
 * Sorts streams with the user's language first,
 * slices to the limit, and maps to SuggestedStream format.
 *
 * @param raw The raw streams from fetchTwitchSuggestionsPage
 * @param twitchLanguage The Twitch language code to prioritize
 * @param limit The maximum number of suggestions to return
 * @return The processed suggestions
 */
function processTwitchStreams(
  raw: any[],
  twitchLanguage: string,
  limit: number = REFRESH_CONFIG.suggestionsLimit
): SuggestedStream[] {
  // deduplicate by channel login
  const seen = new Set<string>();
  const unique = raw.filter((s: any) => {
    const key = s.channel?.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const filtered = unique.filter((s: any) => s.language === twitchLanguage);

  return [...filtered, ...unique.filter((s: any) => s.language !== twitchLanguage)]
    .slice(0, limit)
    .map(({ language: _, ...s }: any) => s);
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
        `${API_CONFIG.kick.apiBaseUrl}/${encodeURIComponent(channel)}`
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
          avatarUrl: data.user?.profile_pic,
          thumbnailUrl: data.livestream.thumbnail?.url || data.livestream.thumbnail?.src,
        };
      } else {
        result[key] = {
          isLive: false,
          avatarUrl: data?.user?.profile_pic,
        };
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
 * @brief Fetch a single page of Kick featured streams
 *
 * Fetches one page of featured livestreams from Kick.
 * Optionally filtered by a category subcategory slug.
 *
 * @param page The page number (1-indexed)
 * @param kickLangCode The Kick language code for the URL
 * @param subcategory Optional category slug to filter results
 * @return The raw streams from that page
 */
async function fetchKickStreamsPage(
  page: number,
  kickLangCode: string,
  subcategory?: string
): Promise<any[]> {
  try {
    const params = new URLSearchParams({ page: String(page) });
    if (subcategory) params.set("subcategory", subcategory);
    const response = await httpGet(
      `${API_CONFIG.kick.featuredUrl}/${kickLangCode}?${params.toString()}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

/**
 * @brief Process raw Kick streams into suggestions
 *
 * Filters by language, deduplicates, sorts by viewer count,
 * and maps to SuggestedStream format.
 *
 * @param raw The raw streams from fetchKickStreamsPage
 * @param kickLangName The Kick language name for filtering
 * @param limit The maximum number of suggestions to return
 * @return The processed suggestions
 */
function processKickStreams(
  raw: any[],
  kickLangName: string,
  limit: number = REFRESH_CONFIG.suggestionsLimit
): SuggestedStream[] {
  const filtered = raw.filter((s) => s.language?.toLowerCase() === kickLangName.toLowerCase());

  // if there are not enough streams in the language, use all streams
  const streams = filtered.length >= 4 ? filtered : raw;

  // deduplicate by channel slug
  const seen = new Set<string>();
  const unique = streams.filter((s) => {
    const key = s.channel?.slug ?? s.slug;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique
    .toSorted(
      (a: any, b: any) => (b.viewer_count ?? b.viewers ?? 0) - (a.viewer_count ?? a.viewers ?? 0)
    )
    .slice(0, limit)
    .map((s: any) => ({
      channel: s.channel?.slug || s.slug,
      platform: "kick" as Platform,
      title: s.session_title || s.title || "",
      // Strip trailing abbreviation suffixes added by Kick, e.g.
      // "Grand Theft Auto V (GTA)" → "Grand Theft Auto V"
      // "Counter-Strike 2 (CS2)"   → "Counter-Strike 2"
      // Only matches ALL-CAPS/digit codes (2–5 chars) so subtitles like
      // "(Java Edition)" or "(The Definitive Edition)" are preserved.
      category:
        (s.categories?.[0]?.name ?? s.category?.name ?? "Just Chatting")
          .replace(/\s*\([A-Z0-9]{2,5}\)\s*$/, "")
          .trim() || "Just Chatting",
      viewerCount: s.viewer_count ?? s.viewers ?? 0,
      thumbnail: s.thumbnail?.src || s.thumbnail?.url,
    }));
}

/**
 * @brief Interleave two arrays of suggestions
 *
 * Alternates items from twitch and kick arrays to create a mixed list.
 *
 * @param twitch The Twitch suggestions
 * @param kick The Kick suggestions
 * @return The interleaved suggestions
 */
function interleave(twitch: SuggestedStream[], kick: SuggestedStream[]): SuggestedStream[] {
  const combined: SuggestedStream[] = [];
  const maxLength = Math.max(twitch.length, kick.length);

  for (let i = 0; i < maxLength; i++) {
    const t = twitch[i];
    if (t) combined.push(t);

    const k = kick[i];
    if (k) combined.push(k);
  }

  return combined;
}

/**
 * @brief Convert a category display name to a URL slug
 *
 * Lowercases the name, replaces any run of non-alphanumeric characters
 * with a single hyphen, and trims leading/trailing hyphens.
 * e.g. "Just Chatting" → "just-chatting", "VALORANT" → "valorant"
 *
 * @param name The display name of the category
 * @return The URL slug
 */
function categoryNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * @brief Fetch Twitch streams for a specific category
 *
 * Uses the Twitch GQL `game(name:...)` query to retrieve live streams
 * in the given category, sorted by viewer count.
 *
 * @param categoryName The display name of the category (e.g. "Just Chatting")
 * @param twitchLanguage The Twitch language code to prioritize
 * @param limit Maximum number of streams to return
 * @return Processed suggestions for the category
 */
async function fetchTwitchStreamsByCategory(
  categoryName: string,
  twitchLanguage: string,
  limit: number = 60
): Promise<SuggestedStream[]> {
  /**
   * Inner helper: fetch streams for a game identified by GQL selector
   * (e.g. `slug: "counter-strike"`) and return processed suggestions.
   */
  const fetchBySelector = async (gameSelector: string): Promise<SuggestedStream[]> => {
    try {
      const query = `
        query {
          game(${gameSelector}) {
            streams(first: ${limit}, options: { sort: VIEWER_COUNT }) {
              edges {
                node {
                  broadcaster { login broadcastSettings { language } }
                  title
                  viewersCount
                  game { displayName }
                  previewImageURL(width: 640, height: 360)
                }
              }
            }
          }
        }
      `;

      const response = await httpPost(API_CONFIG.twitch.gqlUrl, JSON.stringify({ query }), {
        "Client-Id": API_CONFIG.twitch.clientId,
        "Content-Type": "application/json",
      });

      if (!response.ok) return [];
      const data = await response.json();

      const edges = data.data?.game?.streams?.edges ?? [];
      const raw = edges.map((edge: any) => ({
        channel: edge.node.broadcaster.login,
        platform: "twitch" as Platform,
        title: edge.node.title,
        category: edge.node.game?.displayName || categoryName,
        viewerCount: edge.node.viewersCount,
        language: edge.node.broadcaster.broadcastSettings?.language ?? "en",
        thumbnail: edge.node.previewImageURL,
      }));

      return processTwitchStreams(raw, twitchLanguage, limit);
    } catch {
      return [];
    }
  };

  /**
   * Step 1: resolve the exact Twitch slug via searchCategories.
   * This handles cases where the display name used in the app differs
   * from what Twitch calls the category (e.g. "Counter-Strike 2" is
   * catalogued on Twitch simply as "Counter-Strike").
   * The first search result is the most relevant match.
   */
  try {
    const searchQuery = `
      query {
        searchCategories(query: ${JSON.stringify(categoryName)}) {
          edges { node { slug } }
        }
      }
    `;
    const searchRes = await httpPost(
      API_CONFIG.twitch.gqlUrl,
      JSON.stringify({ query: searchQuery }),
      {
        "Client-Id": API_CONFIG.twitch.clientId,
        "Content-Type": "application/json",
      }
    );

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const resolvedSlug = searchData.data?.searchCategories?.edges?.[0]?.node?.slug as
        | string
        | undefined;

      if (resolvedSlug) {
        const results = await fetchBySelector(`slug: ${JSON.stringify(resolvedSlug)}`);
        if (results.length > 0) return results;
      }
    }
  } catch {
    // fall through to derived-slug attempt
  }

  // Step 2: fallback — derive slug from the display name and try directly.
  return fetchBySelector(`slug: ${JSON.stringify(categoryNameToSlug(categoryName))}`);
}

/**
 * @brief Fetch Kick streams for a specific category
 *
 * Fetches multiple pages from the featured livestreams endpoint
 * filtered by the given category slug, in parallel.
 *
 * @param categorySlug The URL slug of the category (e.g. "just-chatting")
 * @param kickLangCode The Kick language code for the URL (e.g. "en")
 * @param kickLangName The Kick language name for filtering (e.g. "English")
 * @param pages Number of pages to fetch in parallel
 * @return Processed suggestions for the category
 */
async function fetchKickStreamsByCategory(
  categorySlug: string,
  kickLangCode: string,
  kickLangName: string,
  pages: number = 3
): Promise<SuggestedStream[]> {
  try {
    const pagePromises = Array.from({ length: pages }, (_, i) =>
      fetchKickStreamsPage(i + 1, kickLangCode, categorySlug)
    );
    const results = await Promise.all(pagePromises);
    return processKickStreams(results.flat(), kickLangName, pages * TWITCH_PAGE_SIZE);
  } catch {
    return [];
  }
}

// --- Composable ---
const _useLiveStatus = () => {
  const { recents } = useRecents();
  const { favorites } = useFavorites();
  const { notificationsEnabled } = usePreferences();
  const visibility = useDocumentVisibility();
  const statuses = ref<StatusMap>({});
  const previousStatuses = ref<StatusMap>({});
  const suggestedStreams = ref<SuggestedStream[]>([]);
  const isChecking = ref(false);
  const isLoadingSuggestions = ref(false);
  const isLoadingMoreSuggestions = ref(false);
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
    // Se o app estiver oculto/minimizado e as notificações estiverem desligadas, não há porquê gastar CPU/Rede
    if (isChecking.value || (visibility.value === "hidden" && !notificationsEnabled.value)) return;

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

      if (twitchResults.status === "fulfilled" && twitchResults.value !== null) {
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
              const names = newLiveChannels.map((c) => c.fav.channel).join(", ");
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
  const getStatus = (channel: string, platform: Platform): LiveStatus | null => {
    if (platform !== "twitch" && platform !== "kick") return null;
    const key = `${platform}:${channel.toLowerCase()}`;
    return statuses.value[key] ?? null;
  };

  /**
   * @brief Check if there are channels to track
   */
  const hasChannels = () =>
    recents.value.some((r) => r.platform === "twitch" || r.platform === "kick") ||
    favorites.value.some((f) => f.platform === "twitch" || f.platform === "kick");

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
    }
  );

  /**
   * @brief Refresh suggestions with two-phase incremental loading
   *
   * Phase 1: Fetches the first page of Twitch and Kick in parallel,
   * renders results immediately for fast time-to-first-content.
   *
   * Phase 2: Continues fetching remaining pages in the background.
   * Twitch pages are fetched sequentially (cursor dependency),
   * Kick pages are fetched in parallel. The suggestion list is
   * re-interleaved reactively after each batch.
   *
   * @returns Promise<void>
   */
  const refreshSuggestions = async () => {
    if (isLoadingSuggestions.value || isLoadingMoreSuggestions.value) return;
    isLoadingSuggestions.value = true;

    const locale = localStorage.getItem("locale") ?? DEFAULT_LOCALE;
    const twitchLanguage =
      SUPPORTED_LANGUAGES[locale]?.apiCodes.twitch ??
      SUPPORTED_LANGUAGES[DEFAULT_LOCALE]!.apiCodes.twitch;
    const kickLang =
      SUPPORTED_LANGUAGES[locale]?.apiCodes.kick ??
      SUPPORTED_LANGUAGES[DEFAULT_LOCALE]!.apiCodes.kick;

    try {
      // PHASE 1: Fetch first page of each platform in parallel
      const [twitchPage1, kickPage1Raw] = await Promise.all([
        fetchTwitchSuggestionsPage(null),
        fetchKickStreamsPage(1, kickLang?.code ?? "en"),
      ]);

      // Process and interleave first batch
      const twitchResults = processTwitchStreams(twitchPage1.streams, twitchLanguage);
      const kickResults = processKickStreams(kickPage1Raw, kickLang?.name ?? "English");
      suggestedStreams.value = interleave(twitchResults, kickResults);

      // UI can render now
      isLoadingSuggestions.value = false;

      // PHASE 2: Background fetch remaining pages
      const hasMoreTwitch = twitchPage1.nextCursor !== null;
      const hasMoreKick = REFRESH_CONFIG.maxKickPages > 1;

      if (hasMoreTwitch || hasMoreKick) {
        isLoadingMoreSuggestions.value = true;

        try {
          // Kick pages 2-N in parallel (pages are independent)
          const kickRemainingPromise = hasMoreKick
            ? Promise.all(
                Array.from({ length: REFRESH_CONFIG.maxKickPages - 1 }, (_, i) =>
                  fetchKickStreamsPage(i + 2, kickLang?.code ?? "en")
                )
              )
            : Promise.resolve([] as any[][]);

          // Twitch pages 2+ sequentially (cursor dependency)
          let cursor = twitchPage1.nextCursor;
          const allTwitchRaw = [...twitchPage1.streams];

          const twitchBackgroundPromise = (async () => {
            while (allTwitchRaw.length < REFRESH_CONFIG.suggestionsLimit && cursor) {
              const page = await fetchTwitchSuggestionsPage(cursor);
              allTwitchRaw.push(...page.streams);
              cursor = page.nextCursor;

              // Re-interleave after each Twitch page for progressive updates
              const processed = processTwitchStreams(allTwitchRaw, twitchLanguage);
              suggestedStreams.value = interleave(processed, kickResults);

              if (page.streams.length < TWITCH_PAGE_SIZE) break;
            }
            return allTwitchRaw;
          })();

          // Wait for both background tasks
          const [kickRemainingPages, finalTwitchRaw] = await Promise.all([
            kickRemainingPromise,
            twitchBackgroundPromise,
          ]);

          // Final merge with all Kick pages
          const allKickRaw = [...kickPage1Raw, ...kickRemainingPages.flat()];
          const finalKick = processKickStreams(allKickRaw, kickLang?.name ?? "English");
          const finalTwitch = processTwitchStreams(finalTwitchRaw, twitchLanguage);
          suggestedStreams.value = interleave(finalTwitch, finalKick);
        } finally {
          isLoadingMoreSuggestions.value = false;
        }
      }
    } finally {
      isLoadingSuggestions.value = false;
      isLoadingMoreSuggestions.value = false;
    }
  };

  onScopeDispose(() => {
    stopPolling();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  });

  /**
   * @brief Fetch streams on-demand for a specific category
   *
   * Queries Twitch (via game GQL) and Kick (via subcategory param)
   * in parallel for the given category name and returns an interleaved
   * list of results. Silently returns an empty array on any failure.
   *
   * @param categoryName The display name of the category
   * @return Interleaved Twitch + Kick suggestions for the category
   */
  const fetchStreamsForCategory = async (categoryName: string): Promise<SuggestedStream[]> => {
    const locale = localStorage.getItem("locale") ?? DEFAULT_LOCALE;
    const twitchLanguage =
      SUPPORTED_LANGUAGES[locale]?.apiCodes.twitch ??
      SUPPORTED_LANGUAGES[DEFAULT_LOCALE]!.apiCodes.twitch;
    const kickLang =
      SUPPORTED_LANGUAGES[locale]?.apiCodes.kick ??
      SUPPORTED_LANGUAGES[DEFAULT_LOCALE]!.apiCodes.kick;

    const categorySlug = categoryNameToSlug(categoryName);

    const [twitchStreams, kickStreams] = await Promise.all([
      fetchTwitchStreamsByCategory(categoryName, twitchLanguage),
      fetchKickStreamsByCategory(categorySlug, kickLang?.code ?? "en", kickLang?.name ?? "English"),
    ]);

    return interleave(twitchStreams, kickStreams);
  };

  return {
    statuses,
    suggestedStreams,
    isChecking,
    isLoadingSuggestions,
    isLoadingMoreSuggestions,
    getStatus,
    startPolling,
    stopPolling,
    checkAll,
    refreshSuggestions,
    fetchStreamsForCategory,
  };
};

export const useLiveStatus = createSharedComposable(_useLiveStatus);

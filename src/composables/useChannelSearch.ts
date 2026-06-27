import { ref, watchEffect, toValue } from "vue";
import type { MaybeRefOrGetter } from "vue";
import { createSharedComposable } from "@vueuse/core";
import type { Platform } from "./useStreams";
import { httpGet, httpPost } from "@/lib/http";
import { API_CONFIG } from "@/config/api";
import { useLiveStatus } from "./useLiveStatus";

export interface ChannelSearchResult {
  channel: string;
  platform: Platform;
  isLive: boolean;
  category?: string;
}

const SEARCH_LIMIT = 5;
const DEBOUNCE_MS = 300;

/**
 * @brief Search Twitch channels by query string
 *
 * Uses the Twitch GQL `searchFor` query to find channels matching the
 * given query, returning live status and current game for each result.
 *
 * @param query The search string
 * @return Matching channels, or null on failure
 */
async function searchTwitchChannels(query: string): Promise<ChannelSearchResult[] | null> {
  const gqlQuery = `
    {
      searchFor(userQuery: ${JSON.stringify(query)}, platform: "web", target: { index: CHANNEL, cursor: null }) {
        channels {
          items {
            login
            stream {
              viewersCount
              game { displayName }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await httpPost(API_CONFIG.twitch.gqlUrl, JSON.stringify({ query: gqlQuery }), {
      "Client-Id": API_CONFIG.twitch.clientId,
      "Content-Type": "application/json",
    });

    if (!response.ok) return null;

    const data = await response.json();
    const items: any[] = data?.data?.searchFor?.channels?.items ?? [];

    return items.slice(0, SEARCH_LIMIT).map((item: any) => ({
      channel: item.login as string,
      platform: "twitch" as Platform,
      isLive: item.stream !== null,
      category: item.stream?.game?.displayName as string | undefined,
    }));
  } catch {
    return null;
  }
}

/**
 * @brief Search Kick channels by looking up the typed slug directly
 *
 * The Kick public search endpoint is protected by Cloudflare and cannot
 * be called from a desktop app without browser cookies. Instead, we do a
 * direct channel lookup against the typed name — it either resolves (and
 * we return that single result) or returns 404 (no results). This gives
 * instant feedback for exact-match queries, which is the most common
 * autocomplete use-case.
 *
 * @param query The search string (treated as a channel slug)
 * @param cachedKickChannels Kick channels already loaded in memory to match by prefix
 * @return Matching channel(s), or null on network failure
 */
async function searchKickChannels(
  query: string,
  cachedKickChannels: { channel: string; isLive: boolean; category?: string }[]
): Promise<ChannelSearchResult[] | null> {
  const trimmed = query.toLowerCase().trim();

  const fromCache = cachedKickChannels
    .filter((s) => s.channel.toLowerCase().startsWith(trimmed))
    .slice(0, SEARCH_LIMIT)
    .map((s) => ({
      channel: s.channel,
      platform: "kick" as Platform,
      isLive: s.isLive,
      category: s.category,
    }));

  if (fromCache.length > 0) return fromCache;

  try {
    const slug = trimmed;
    const response = await httpGet(`${API_CONFIG.kick.apiBaseUrl}/${encodeURIComponent(slug)}`);

    if (response.status === 404) return [];
    if (!response.ok) return null;

    const data = await response.json();
    const channelSlug = (data?.slug ?? slug) as string;
    const isLive = data?.livestream !== null && data?.livestream !== undefined;
    const category = data?.livestream?.categories?.[0]?.name as string | undefined;

    return [{ channel: channelSlug, platform: "kick" as Platform, isLive, category }];
  } catch {
    return null;
  }
}

const _useChannelSearch = () => {
  const { suggestedStreams } = useLiveStatus();

  /**
   * @brief Create a reactive search session for a given query and platform
   *
   * Watches `query` and `platform` reactively via watchEffect, debounces
   * the search by 300ms, and populates `results` with up to 5 channel
   * suggestions. Supported platforms: twitch, kick. For other platforms,
   * results stay empty.
   *
   * @param query Reactive or plain string query
   * @param platform Reactive or plain Platform value
   * @return Reactive results, isLoading flag, and a clear() function
   */
  const search = (query: MaybeRefOrGetter<string>, platform: MaybeRefOrGetter<Platform>) => {
    const results = ref<ChannelSearchResult[]>([]);
    const isLoading = ref(false);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let currentRequestId = 0;

    const clear = () => {
      results.value = [];
      isLoading.value = false;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    };

    watchEffect(() => {
      const currentQuery = toValue(query);
      const currentPlatform = toValue(platform);

      results.value = [];

      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      const trimmed = currentQuery.trim();
      if (!trimmed || (currentPlatform !== "twitch" && currentPlatform !== "kick")) {
        isLoading.value = false;
        return;
      }

      isLoading.value = true;

      debounceTimer = setTimeout(async () => {
        const requestId = ++currentRequestId;

        let found: ChannelSearchResult[] | null;
        if (currentPlatform === "twitch") {
          found = await searchTwitchChannels(trimmed);
        } else {
          const kickCache = suggestedStreams.value
            .filter((s) => s.platform === "kick")
            .map((s) => ({ channel: s.channel, isLive: true, category: s.category }));
          found = await searchKickChannels(trimmed, kickCache);
        }

        if (requestId !== currentRequestId) return;

        results.value = found ?? [];
        isLoading.value = false;
      }, DEBOUNCE_MS);
    });

    return { results, isLoading, clear };
  };

  return { search };
};

export const useChannelSearch = createSharedComposable(_useChannelSearch);

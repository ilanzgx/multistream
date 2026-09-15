import { ref, watchEffect, toValue } from "vue";
import type { MaybeRefOrGetter } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";
import type { Platform } from "./useStreams";
import { httpGet, httpPost } from "@/lib/http";
import { API_CONFIG } from "@/config/api";
import { useLiveStatus } from "./useLiveStatus";
import { useFavorites } from "./useFavorites";
import { useRecents } from "./useRecents";

export interface ChannelSearchResult {
  channel: string;
  handle?: string;
  platform: Platform;
  isLive: boolean;
  category?: string;
}

const SEARCH_LIMIT = 5;
const DEBOUNCE_MS = 300;

function getLocalChannelMatches(
  query: string,
  platform: Platform,
  favorites: { channel: string; platform: Platform; displayName?: string }[],
  recents: { channel: string; platform: Platform; displayName?: string; handle?: string }[],
  suggestedStreams: {
    channel: string;
    platform: Platform;
    category?: string;
    displayName?: string;
    handle?: string;
  }[],
  getStatus?: (channel: string, platform: Platform) => any
): ChannelSearchResult[] {
  const cleanQuery = query.toLowerCase().replace(/^@+/, "").trim();
  if (!cleanQuery) return [];

  const results: ChannelSearchResult[] = [];
  const seen = new Set<string>();

  const checkAndAdd = (
    channel: string,
    displayName?: string,
    defaultCategory?: string,
    handle?: string
  ) => {
    const cleanChannel = channel.replace(/^@+/, "").trim();
    const cleanDisplay = (displayName || "").replace(/^@+/, "").trim();
    const cleanHandle = handle ? handle.replace(/^@+/, "").trim() : undefined;
    const key = cleanChannel.toLowerCase();

    if (!key || seen.has(key)) return;

    const matches =
      key.includes(cleanQuery) ||
      (cleanDisplay && cleanDisplay.toLowerCase().includes(cleanQuery)) ||
      (cleanHandle && cleanHandle.toLowerCase().includes(cleanQuery));

    if (matches) {
      seen.add(key);
      const status = getStatus ? getStatus(cleanChannel, platform) : null;
      const resolvedHandle =
        cleanHandle ||
        (cleanDisplay && cleanDisplay.toLowerCase() !== key ? cleanChannel : undefined);
      results.push({
        channel: cleanDisplay || cleanChannel,
        handle: resolvedHandle,
        platform,
        isLive: status?.isLive ?? false,
        category: status?.category || defaultCategory,
      });
    }
  };

  for (const fav of favorites) {
    if (fav.platform === platform) {
      checkAndAdd(fav.channel, fav.displayName);
    }
  }

  for (const rec of recents) {
    if (rec.platform === platform) {
      checkAndAdd(rec.channel, rec.displayName, undefined, rec.handle);
    }
  }

  for (const sug of suggestedStreams) {
    if (sug.platform === platform) {
      checkAndAdd(sug.channel, sug.displayName, sug.category, sug.handle);
    }
  }

  return results.slice(0, SEARCH_LIMIT);
}

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
  const { suggestedStreams, getStatus } = useLiveStatus();
  const { favorites } = useFavorites();
  const { recents } = useRecents();

  /**
   * @brief Create a reactive search session for a given query and platform
   *
   * Watches `query` and `platform` reactively via watchEffect, debounces
   * the search by 300ms, and populates `results` with up to 5 channel
   * suggestions. Supported platforms: twitch, kick, youtube. For other platforms,
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
      if (
        !trimmed ||
        (currentPlatform !== "twitch" &&
          currentPlatform !== "kick" &&
          currentPlatform !== "youtube")
      ) {
        isLoading.value = false;
        return;
      }

      isLoading.value = true;

      debounceTimer = setTimeout(async () => {
        const requestId = ++currentRequestId;

        let found: ChannelSearchResult[] = [];

        if (currentPlatform === "youtube") {
          const localMatches = getLocalChannelMatches(
            trimmed,
            "youtube",
            favorites.value,
            recents.value,
            suggestedStreams.value,
            getStatus
          );
          const cleanTrimmed = trimmed.replace(/^@+/, "").trim();
          if (localMatches.length < SEARCH_LIMIT && cleanTrimmed.length > 0) {
            try {
              const remoteResults: {
                channel: string;
                display_name?: string;
                is_live: boolean;
                category?: string;
              }[] = await invoke("youtube_search_channels", { query: cleanTrimmed });
              const seen = new Set(localMatches.map((m) => (m.handle ?? m.channel).toLowerCase()));
              for (const r of remoteResults) {
                const key = r.channel.toLowerCase();
                if (!seen.has(key)) {
                  seen.add(key);
                  localMatches.push({
                    channel: r.display_name || r.channel,
                    handle: r.channel,
                    platform: "youtube",
                    isLive: r.is_live,
                    category: r.category,
                  });
                }
                if (localMatches.length >= SEARCH_LIMIT) break;
              }
            } catch {
              /* silent */
            }
          }
          if (localMatches.length === 0 && cleanTrimmed.length > 0) {
            const status = getStatus ? getStatus(cleanTrimmed, "youtube") : null;
            localMatches.push({
              channel: cleanTrimmed,
              platform: "youtube",
              isLive: status?.isLive ?? false,
              category: status?.category,
            });
          }
          found = localMatches.slice(0, SEARCH_LIMIT);
        } else if (currentPlatform === "twitch") {
          const localMatches = getLocalChannelMatches(
            trimmed,
            "twitch",
            favorites.value,
            recents.value,
            suggestedStreams.value,
            getStatus
          );
          const remoteResults = (await searchTwitchChannels(trimmed)) ?? [];
          const merged: ChannelSearchResult[] = [...localMatches];
          const seen = new Set(localMatches.map((m) => m.channel.toLowerCase()));
          for (const r of remoteResults) {
            const key = r.channel.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              merged.push(r);
            }
          }
          found = merged.slice(0, SEARCH_LIMIT);
        } else if (currentPlatform === "kick") {
          const localMatches = getLocalChannelMatches(
            trimmed,
            "kick",
            favorites.value,
            recents.value,
            suggestedStreams.value,
            getStatus
          );
          const kickCache = suggestedStreams.value
            .filter((s) => s.platform === "kick")
            .map((s) => ({ channel: s.channel, isLive: true, category: s.category }));
          const remoteResults = (await searchKickChannels(trimmed, kickCache)) ?? [];
          const merged: ChannelSearchResult[] = [...localMatches];
          const seen = new Set(localMatches.map((m) => m.channel.toLowerCase()));
          for (const r of remoteResults) {
            const key = r.channel.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              merged.push(r);
            }
          }
          found = merged.slice(0, SEARCH_LIMIT);
        }

        if (requestId !== currentRequestId) return;

        results.value = found;
        isLoading.value = false;
      }, DEBOUNCE_MS);
    });

    return { results, isLoading, clear };
  };

  return { search };
};

export const useChannelSearch = createSharedComposable(_useChannelSearch);

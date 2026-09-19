import { ref, computed, onScopeDispose, watch } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";

export const debugErrors = ref<string[]>([]);
import { isTauri } from "./useUpdater";
import { useTwitchAuth } from "./useTwitchAuth";
import { useLiveStatus } from "./useLiveStatus";
import { useFavorites } from "./useFavorites";
import { REFRESH_CONFIG } from "@/config/api";

export interface FollowedChannel {
  id: string;
  platform: "twitch" | "kick" | "youtube";
  displayName: string;
  avatarUrl: string;
  isLive: boolean;
  viewerCount?: number;
  game?: string;
  thumbnailUrl?: string;
  title?: string;
  isFavorite?: boolean;
  isFollowed?: boolean;
  videoId?: string;
  handle?: string;
}

const _useFollowedChannels = () => {
  const twitchChannels = ref<FollowedChannel[]>([]);
  const { authenticated: twitchAuthenticated } = useTwitchAuth();
  const { statuses, isChecking, checkAll } = useLiveStatus();
  const { favorites } = useFavorites();
  const isFetchingTwitch = ref(false);
  const platformFilter = ref<"all" | "twitch" | "kick" | "youtube">("all");
  const hasLoadedTwitchOnce = ref(false);
  const hasLoadedFavoritesOnce = ref(false);

  watch(isChecking, (val) => {
    if (!val) {
      hasLoadedFavoritesOnce.value = true;
    }
  });

  const hasUncheckedFavorites = computed(() => {
    if (favorites.value.length === 0) return false;
    return favorites.value.some(
      (f) =>
        (f.platform === "twitch" || f.platform === "kick" || f.platform === "youtube") &&
        statuses.value[`${f.platform}:${f.channel.toLowerCase()}`] === undefined
    );
  });

  const isInitialLoading = computed(() => {
    if (twitchAuthenticated.value && !hasLoadedTwitchOnce.value && isFetchingTwitch.value) {
      return true;
    }
    if (
      !hasLoadedFavoritesOnce.value &&
      hasUncheckedFavorites.value &&
      (isChecking?.value ?? false)
    ) {
      return true;
    }
    return false;
  });

  const isLoading = computed(() => isFetchingTwitch.value || (isChecking?.value ?? false));
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const kickChannels = computed<FollowedChannel[]>(() => {
    const kickFavs = favorites.value.filter((f) => f.platform === "kick");
    return kickFavs
      .map((f) => {
        const status = statuses.value[`kick:${f.channel.toLowerCase()}`];
        return {
          id: f.channel,
          platform: "kick" as const,
          displayName: f.channel,
          avatarUrl: status?.avatarUrl ?? "",
          isLive: status?.isLive ?? false,
          viewerCount: status?.viewerCount ?? 0,
          title: status?.title,
          game: status?.category,
          thumbnailUrl: status?.thumbnailUrl,
          isFavorite: true,
        };
      })
      .filter((channel) => channel.isLive);
  });

  const youtubeChannels = computed<FollowedChannel[]>(() => {
    const youtubeFavs = favorites.value.filter((f) => f.platform === "youtube");
    return youtubeFavs
      .flatMap((f) => {
        const channelClean = f.channel.toLowerCase().replace(/^@+/, "");
        const key = `youtube:${channelClean}`;
        let status = statuses.value[key] || statuses.value[`youtube:@${channelClean}`];
        if (!status || !status.isLive) {
          const match = Object.entries(statuses.value).find(
            ([k, s]) =>
              s.isLive &&
              k.startsWith("youtube:") &&
              ((s.handle && s.handle.toLowerCase().replace(/^@+/, "") === channelClean) ||
                (s.videoId && s.videoId.toLowerCase() === channelClean) ||
                (s.displayName && s.displayName.toLowerCase() === channelClean) ||
                k.replace(/^youtube:@?/, "") === channelClean ||
                s.liveStreams?.some((ls) => ls.videoId.toLowerCase() === channelClean))
          );
          if (match) {
            status = match[1];
          }
        }
        if (!status || !status.isLive) {
          return [];
        }

        const rawName =
          (status?.displayName && !status.displayName.startsWith("@")
            ? status.displayName
            : null) ||
          (f.displayName && !f.displayName.startsWith("@") ? f.displayName : null) ||
          status?.displayName ||
          f.displayName ||
          status?.handle ||
          f.channel;

        const displayName = rawName.replace(/^@/, "");
        const rawHandle =
          status?.handle ||
          (f.channel.startsWith("@") ? f.channel : undefined) ||
          (status?.displayName?.startsWith("@") ? status.displayName : undefined) ||
          f.channel;
        const handle = rawHandle.replace(/^@+/, "");

        if (status.liveStreams && status.liveStreams.length > 0) {
          return status.liveStreams.map((stream) => ({
            id: stream.videoId,
            platform: "youtube" as const,
            displayName,
            handle,
            avatarUrl: status?.avatarUrl ?? "",
            isLive: true,
            viewerCount: stream.viewerCount,
            title: stream.title || status?.title,
            game: status?.category,
            thumbnailUrl:
              stream.thumbnailUrl || `https://i.ytimg.com/vi/${stream.videoId}/hqdefault.jpg`,
            isFavorite: true,
            videoId: stream.videoId,
          }));
        }

        return [
          {
            id: status?.videoId || f.channel,
            platform: "youtube" as const,
            displayName,
            handle,
            avatarUrl: status?.avatarUrl ?? "",
            isLive: true,
            viewerCount: status?.viewerCount ?? 0,
            title: status?.title,
            game: status?.category,
            thumbnailUrl: status?.thumbnailUrl,
            isFavorite: true,
            videoId: status?.videoId,
          },
        ];
      })
      .filter((channel) => channel.isLive);
  });

  const twitchFavChannels = computed<FollowedChannel[]>(() => {
    const twitchFavs = favorites.value.filter((f) => f.platform === "twitch");
    const followedIds = new Set(twitchChannels.value.map((c) => c.id.toLowerCase()));

    return twitchFavs
      .filter((f) => !followedIds.has(f.channel.toLowerCase()))
      .map((f) => {
        const status = statuses.value[`twitch:${f.channel.toLowerCase()}`];
        return {
          id: f.channel,
          platform: "twitch" as const,
          displayName: f.channel,
          avatarUrl: status?.avatarUrl ?? "",
          isLive: status?.isLive ?? false,
          viewerCount: status?.viewerCount ?? 0,
          title: status?.title,
          game: status?.category,
          thumbnailUrl: status?.thumbnailUrl,
          isFavorite: true,
        };
      })
      .filter((channel) => channel.isLive);
  });

  const channels = computed<FollowedChannel[]>(() => {
    const twitchFollowed = twitchChannels.value.map((c) => {
      const isFav = favorites.value.some(
        (f) => f.platform === "twitch" && f.channel.toLowerCase() === c.id.toLowerCase()
      );
      return { ...c, isFollowed: true, ...(isFav && { isFavorite: true }) };
    });

    const combined = [
      ...twitchFollowed,
      ...twitchFavChannels.value,
      ...kickChannels.value,
      ...youtubeChannels.value,
    ];

    combined.sort((a, b) => {
      const viewersA = a.viewerCount || 0;
      const viewersB = b.viewerCount || 0;
      if (viewersA !== viewersB) return viewersB - viewersA;
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });

    return combined;
  });

  const filteredChannels = computed(() => {
    if (platformFilter.value === "all") return channels.value;
    return channels.value.filter((c) => c.platform === platformFilter.value);
  });

  const fetchTwitchFollowed = async () => {
    if (!isTauri() || !twitchAuthenticated.value || isFetchingTwitch.value) {
      if (!twitchAuthenticated.value) {
        twitchChannels.value = [];
      }
      return;
    }

    isFetchingTwitch.value = true;
    try {
      const results = await invoke<FollowedChannel[]>("twitch_get_followed_streams");
      if (results !== null) {
        twitchChannels.value = results;
      }
    } catch (e) {
      console.error("Failed to fetch Twitch followed streams", e);
      debugErrors.value.push(`Twitch: ${String(e)}`);
    } finally {
      isFetchingTwitch.value = false;
      hasLoadedTwitchOnce.value = true;
    }
  };

  const refresh = async () => {
    if (!isTauri() || isFetchingTwitch.value) return;

    if (twitchAuthenticated.value) {
      isFetchingTwitch.value = true;
    }
    debugErrors.value = [];
    try {
      const promises: Promise<any>[] = [checkAll()];
      if (twitchAuthenticated.value) {
        promises.push(
          invoke<FollowedChannel[]>("twitch_get_followed_streams")
            .then((results) => {
              if (results !== null) {
                twitchChannels.value = results;
              }
            })
            .catch((e) => {
              console.error("Failed to fetch Twitch followed streams", e);
              debugErrors.value.push(`Twitch: ${String(e)}`);
            })
            .finally(() => {
              isFetchingTwitch.value = false;
              hasLoadedTwitchOnce.value = true;
            })
        );
      } else {
        twitchChannels.value = [];
      }
      await Promise.allSettled(promises);
    } catch (e) {
      console.error("Failed to refresh followed channels", e);
    } finally {
      hasLoadedFavoritesOnce.value = true;
    }
  };

  const poll = async () => {
    if (twitchAuthenticated.value) {
      await fetchTwitchFollowed();
    }
  };

  const startPolling = () => {
    if (pollInterval) clearInterval(pollInterval);
    refresh();
    pollInterval = setInterval(poll, REFRESH_CONFIG.interval);
  };

  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  watch(twitchAuthenticated, (isAuth) => {
    if (isAuth) {
      hasLoadedTwitchOnce.value = false;
    }
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      refresh();
    }
  });

  const handleVisibilityChange = () => {
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      startPolling();
    } else {
      stopPolling();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Initial fetch
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      startPolling();
    }

    onScopeDispose(() => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    });
  }

  return {
    channels: filteredChannels,
    isLoading,
    isInitialLoading,
    platformFilter,
    refresh,
  };
};

export const useFollowedChannels = createSharedComposable(_useFollowedChannels);

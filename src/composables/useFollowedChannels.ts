import { ref, computed, onScopeDispose, watch } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";

export const debugErrors = ref<string[]>([]);
import { isTauri } from "./useUpdater";
import { useTwitchAuth } from "./useTwitchAuth";
import { useKickAuth } from "./useKickAuth";
import { useLiveStatus } from "./useLiveStatus";
import { useFavorites } from "./useFavorites";
import { REFRESH_CONFIG } from "@/config/api";

export interface FollowedChannel {
  id: string;
  platform: "twitch" | "kick";
  displayName: string;
  avatarUrl: string;
  isLive: boolean;
  viewerCount?: number;
  game?: string;
  thumbnailUrl?: string;
  title?: string;
  isFavorite?: boolean;
  isFollowed?: boolean;
}

const _useFollowedChannels = () => {
  const twitchChannels = ref<FollowedChannel[]>([]);
  const isLoading = ref(false);
  const platformFilter = ref<"all" | "twitch" | "kick">("all");

  const { authenticated: twitchAuthenticated } = useTwitchAuth();
  const { authenticated: kickAuthenticated } = useKickAuth();
  const { statuses } = useLiveStatus();
  const { favorites } = useFavorites();
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const kickChannels = computed<FollowedChannel[]>(() => {
    if (!kickAuthenticated.value) return [];

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

    const combined = [...twitchFollowed, ...twitchFavChannels.value, ...kickChannels.value];

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

  const refresh = async () => {
    if (!isTauri() || isLoading.value) return;

    isLoading.value = true;
    debugErrors.value = [];
    try {
      if (twitchAuthenticated.value) {
        const results = await invoke<FollowedChannel[]>("twitch_get_followed_streams").catch(
          (e) => {
            console.error("Failed to fetch Twitch followed streams", e);
            debugErrors.value.push(`Twitch: ${String(e)}`);
            return [];
          }
        );
        twitchChannels.value = results;
      } else {
        twitchChannels.value = [];
      }
    } catch (e) {
      console.error("Failed to refresh followed channels", e);
    } finally {
      isLoading.value = false;
    }
  };

  const startPolling = () => {
    if (pollInterval) clearInterval(pollInterval);
    refresh();
    pollInterval = setInterval(refresh, REFRESH_CONFIG.interval);
  };

  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  watch([twitchAuthenticated, kickAuthenticated], () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      refresh();
    }
  });

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      startPolling();
    } else {
      stopPolling();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Initial fetch
    if (document.visibilityState === "visible") {
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
    platformFilter,
    refresh,
  };
};

export const useFollowedChannels = createSharedComposable(_useFollowedChannels);

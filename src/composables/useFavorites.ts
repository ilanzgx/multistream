import type { Platform } from "./useStreams";
import { createSharedComposable, useStorage } from "@vueuse/core";

const MAX_FAVORITES = 30;

export interface FavoriteChannel {
  channel: string;
  platform: Platform;
  iframeUrl?: string;
  addedAt: number;
}

const _useFavorites = () => {
  const favorites = useStorage<FavoriteChannel[]>("favorites", []);

  const addFavorite = (
    channel: string,
    platform: Platform,
    iframeUrl?: string,
  ) => {
    const alreadyExists = favorites.value.some(
      (f) =>
        f.channel.toLowerCase() === channel.toLowerCase() &&
        f.platform === platform,
    );
    if (alreadyExists) return;

    favorites.value = [
      {
        channel,
        platform,
        ...(iframeUrl && { iframeUrl }),
        addedAt: Date.now(),
      },
      ...favorites.value,
    ].slice(0, MAX_FAVORITES);
  };

  const removeFavorite = (channel: string, platform: Platform) => {
    favorites.value = favorites.value.filter(
      (f) =>
        !(
          f.channel.toLowerCase() === channel.toLowerCase() &&
          f.platform === platform
        ),
    );
  };

  const clearFavorites = () => {
    favorites.value = [];
  };

  return {
    favorites,
    addFavorite,
    removeFavorite,
    clearFavorites,
  };
};

export const useFavorites = createSharedComposable(_useFavorites);

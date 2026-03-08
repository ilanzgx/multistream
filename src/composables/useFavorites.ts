import type { Platform } from "./useStreams";
import { createSharedComposable, useStorage } from "@vueuse/core";

export interface FavoriteChannel {
  channel: string;
  platform: Platform;
  iframeUrl?: string;
  addedAt: number;
}

const _useFavorites = () => {
  const favorites = useStorage<FavoriteChannel[]>("favorites", []);

  /**
   * @brief Add a favorite channel
   *
   * @details
   * If the channel already exists, it will not be added again.
   *
   * @param channel The channel name
   * @param platform The platform
   * @param iframeUrl The iframe URL (optional)
   * @return void
   */
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
    ];
  };

  /**
   * @brief Remove a favorite channel
   *
   * @param channel The channel name
   * @param platform The platform
   * @return void
   */
  const removeFavorite = (channel: string, platform: Platform) => {
    favorites.value = favorites.value.filter(
      (f) =>
        !(
          f.channel.toLowerCase() === channel.toLowerCase() &&
          f.platform === platform
        ),
    );
  };

  /**
   * @brief Clear all favorites
   *
   * @return void
   */
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

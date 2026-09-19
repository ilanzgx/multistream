import type { Platform } from "./useStreams";
import { createSharedComposable, useStorage } from "@vueuse/core";

export interface FavoriteChannel {
  channel: string;
  platform: Platform;
  lastVideoId?: string;
  displayName?: string;
  iframeUrl?: string;
  addedAt: number;
}

const isMatchingFavorite = (
  favorite: FavoriteChannel,
  channel: string,
  platform: Platform,
  iframeUrl?: string
): boolean => {
  if (favorite.platform !== platform) return false;
  if (platform === "custom" && (iframeUrl || favorite.iframeUrl)) {
    return favorite.iframeUrl?.toLowerCase() === (iframeUrl || "").toLowerCase();
  }
  if (platform === "youtube") {
    const cleanFav = favorite.channel.replace(/^@+/, "").toLowerCase();
    const cleanChan = channel.replace(/^@+/, "").toLowerCase();
    if (cleanFav === cleanChan) return true;
  }
  return favorite.channel.toLowerCase() === channel.toLowerCase();
};

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
    displayName?: string
  ) => {
    if (favorites.value.some((f) => isMatchingFavorite(f, channel, platform, iframeUrl))) {
      return;
    }

    const remainingFavorites = favorites.value.filter((f) => {
      if (
        f.platform === platform &&
        f.channel.toLowerCase() === channel.toLowerCase() &&
        !f.iframeUrl &&
        iframeUrl
      ) {
        return false;
      }
      return true;
    });

    favorites.value = [
      {
        channel,
        platform,
        addedAt: Date.now(),
        displayName,
        iframeUrl,
      },
      ...remainingFavorites,
    ];
  };

  /**
   * @brief Remove a favorite channel
   *
   * @param channel The channel name
   * @param platform The platform
   * @param iframeUrl The iframe URL (optional)
   * @return void
   */
  const removeFavorite = (channel: string, platform: Platform, iframeUrl?: string) => {
    favorites.value = favorites.value.filter(
      (f) => !isMatchingFavorite(f, channel, platform, iframeUrl)
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

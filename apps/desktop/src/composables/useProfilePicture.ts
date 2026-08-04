import { ref } from "vue";
import { createSharedComposable } from "@vueuse/core";
import type { Platform } from "./useStreams";
import { httpGet, httpPost } from "@/lib/http";
import { API_CONFIG } from "@/config/api";

/**
 * @brief Fetch the profile picture URL for a Twitch channel
 *
 * Uses the Twitch GQL API to look up the profile image for the given
 * channel login. Returns null on network failure or if the user is not found.
 *
 * @param channel The Twitch channel login name
 * @return The profile image URL, or null on failure
 */
async function fetchTwitchProfilePicture(channel: string): Promise<string | null> {
  const query = `{ user(login: ${JSON.stringify(channel.toLowerCase())}) { profileImageURL(width: 150) } }`;
  try {
    const response = await httpPost(API_CONFIG.twitch.gqlUrl, JSON.stringify({ query }), {
      "Client-Id": API_CONFIG.twitch.clientId,
      "Content-Type": "application/json",
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data?.data?.user?.profileImageURL as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * @brief Fetch the profile picture URL for a Kick channel
 *
 * Uses the Kick public channel API to look up the user's profile picture.
 * Returns null on network failure or if the channel is not found.
 *
 * @param channel The Kick channel slug
 * @return The profile picture URL, or null on failure
 */
async function fetchKickProfilePicture(channel: string): Promise<string | null> {
  try {
    const response = await httpGet(
      `${API_CONFIG.kick.apiBaseUrl}/${encodeURIComponent(channel.toLowerCase())}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return (data?.user?.profile_pic as string | undefined) ?? null;
  } catch {
    return null;
  }
}

const fetchers: Partial<Record<Platform, (ch: string) => Promise<string | null>>> = {
  twitch: fetchTwitchProfilePicture,
  kick: fetchKickProfilePicture,
};

const _useProfilePicture = () => {
  const cache = ref(new Map<string, string | null>());

  /**
   * @brief Resolve the profile picture URL for a channel
   *
   * Returns the cached value immediately if available. Otherwise fires a
   * background request and updates the reactive ref when it resolves.
   * Unsupported platforms (youtube, custom) resolve to null with no request.
   *
   * @param channel The channel name or slug
   * @param platform The streaming platform
   * @return A reactive ref with the profile picture URL, or null
   */
  const getProfilePicture = (channel: string, platform: Platform) => {
    const key = `${platform}:${channel.toLowerCase()}`;
    const picture = ref<string | null>(cache.value.get(key) ?? null);

    if (cache.value.has(key)) return picture;

    const fetcher = fetchers[platform];
    if (!fetcher) return picture;

    fetcher(channel).then((url) => {
      cache.value.set(key, url);
      picture.value = url;
    });

    return picture;
  };

  return { cache, getProfilePicture };
};

export const useProfilePicture = createSharedComposable(_useProfilePicture);

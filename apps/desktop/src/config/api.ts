export const API_CONFIG = {
  twitch: {
    clientId: "kimne78kx3ncx6brgo4mv6wki5h1ko",
    gqlUrl: "https://gql.twitch.tv/gql",
  },
  kick: {
    apiBaseUrl: "https://kick.com/api/v2/channels",
    apiV1BaseUrl: "https://kick.com/api/v1/channels",
    apiV1Url: (channel: string) =>
      `https://kick.com/api/v1/channels/${encodeURIComponent(channel)}`,
    apiV2Url: (channel: string) =>
      `https://kick.com/api/v2/channels/${encodeURIComponent(channel)}`,
    emotesUrl: (channel: string) => `https://kick.com/emotes/${encodeURIComponent(channel)}`,
    featuredUrl: "https://kick.com/stream/featured-livestreams",
  },
  sevenTv: {
    globalEmotesUrl: "https://7tv.io/v3/emote-sets/global",
    twitchUserEmotesUrl: (userId: string) =>
      `https://7tv.io/v3/users/twitch/${encodeURIComponent(userId)}`,
    kickUserEmotesUrl: (channelSlug: string) =>
      `https://7tv.io/v3/users/kick/${encodeURIComponent(channelSlug)}`,
  },
  bttv: {
    globalEmotesUrl: "https://api.betterttv.net/3/cached/emotes/global",
    twitchUserEmotesUrl: (userId: string) =>
      `https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(userId)}`,
  },
  decapi: {
    twitchIdUrl: (username: string) =>
      `https://decapi.me/twitch/id/${encodeURIComponent(username)}`,
    twitchAvatarUrl: (username: string) =>
      `https://decapi.me/twitch/avatar/${encodeURIComponent(username)}`,
  },
  adamcy: {
    twitchGlobalEmotesUrl: "https://emotes.adamcy.pl/v1/global/emotes/twitch",
  },
};

export const REFRESH_CONFIG = {
  interval: 30000, // 30s
  suggestionsInterval: 300000, // 5m (300,000ms)
  maxKickPages: 8,
  suggestionsLimit: 150,
};

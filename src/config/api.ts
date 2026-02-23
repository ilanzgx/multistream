export const API_CONFIG = {
  twitch: {
    clientId: "kimne78kx3ncx6brgo4mv6wki5h1ko",
    gqlUrl: "https://gql.twitch.tv/gql",
  },
  kick: {
    apiBaseUrl: "https://kick.com/api/v2/channels",
    featuredUrl: "https://kick.com/stream/featured-livestreams",
  },
};

export const REFRESH_CONFIG = {
  interval: 30000, // 30s
  maxKickPages: 3,
  suggestionsLimit: 8,
};

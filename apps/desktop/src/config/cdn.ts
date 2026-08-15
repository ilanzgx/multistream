export const CDN_CONFIG = {
  sevenTv: {
    emote: (id: string, size: "1x" | "2x" | "3x" | "4x" = "1x") =>
      `https://cdn.7tv.app/emote/${id}/${size}.webp`,
  },
  bttv: {
    emote: (id: string, size: "1x" | "2x" | "3x" = "1x") =>
      `https://cdn.betterttv.net/emote/${id}/${size}`,
  },
  twitch: {
    emote: (id: string) => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`,
    previewThumbnail: (channel: string) =>
      `https://static-cdn.jtvnw.net/previews-ttv/live_user_${channel.toLowerCase()}-320x180.jpg`,
  },
  kick: {
    emote: (id: string | number) => `https://files.kick.com/emotes/${id}/fullsize`,
  },
  avatarFallback: (name: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
};

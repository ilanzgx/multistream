import { CustomIcon, KickIcon, TwitchIcon, YoutubeIcon } from "@/components/icons";
import type { Component } from "vue";

export type Platform = "twitch" | "kick" | "youtube" | "custom";

export interface PlatformConfig {
  id: Platform;
  name: string;
  color: string;
  icon: Component;
  baseUrl: string;
  embedUrl: string;
  chatUrl: string;
  domains: string[];
  getEmbedUrl: (channel: string, parentHost?: string) => string;
  getChatUrl: (channel: string, parentHost?: string) => string;
}

export function getParentHost(): string {
  if (typeof window === "undefined") return "localhost";
  const hostname = window.location.hostname;
  if (!hostname || hostname.includes("tauri") || hostname === "") {
    return "localhost";
  }
  return hostname;
}

export const PLATFORMS: Record<Platform, PlatformConfig> = {
  twitch: {
    id: "twitch",
    name: "Twitch",
    color: "#9146FF",
    icon: TwitchIcon,
    baseUrl: "https://twitch.tv",
    embedUrl: "https://player.twitch.tv",
    chatUrl: "https://www.twitch.tv/embed",
    domains: ["twitch.tv", "twitch.com"],
    getEmbedUrl: (channel: string, parentHost = getParentHost()) =>
      `https://player.twitch.tv/?channel=${channel}&parent=${parentHost}&autoplay=true&muted=true`,
    getChatUrl: (channel: string, parentHost = getParentHost()) =>
      `https://www.twitch.tv/embed/${channel}/chat?parent=${parentHost}&darkpopout=true`,
  },
  kick: {
    id: "kick",
    name: "Kick",
    color: "#53FC18",
    icon: KickIcon,
    baseUrl: "https://kick.com",
    embedUrl: "https://player.kick.cx",
    chatUrl: "https://chat.kick.cx/embed",
    domains: ["kick.com", "kick.start.gg"],
    getEmbedUrl: (channel: string) => `https://player.kick.cx/${channel}`,
    getChatUrl: (channel: string) => `https://chat.kick.cx/embed/${channel}?readonly=true`,
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    color: "#FF0000",
    icon: YoutubeIcon,
    baseUrl: "https://youtube.com",
    embedUrl: "https://www.youtube-nocookie.com/embed",
    chatUrl: "https://www.youtube.com/live_chat",
    domains: ["youtube.com", "youtu.be"],
    getEmbedUrl: (channel: string) =>
      `https://www.youtube-nocookie.com/embed/${channel}?autoplay=1`,
    getChatUrl: (channel: string) =>
      `https://www.youtube.com/live_chat?v=${channel}&embed_domain=localhost&dark_theme=1`,
  },
  custom: {
    id: "custom",
    name: "Custom",
    color: "#6366F1",
    icon: CustomIcon,
    baseUrl: "",
    embedUrl: "",
    chatUrl: "",
    domains: [],
    getEmbedUrl: (url: string) => url,
    getChatUrl: (url: string) => url,
  },
};

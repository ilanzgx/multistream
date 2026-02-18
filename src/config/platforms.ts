import {
  CustomIcon,
  KickIcon,
  TwitchIcon,
  YoutubeIcon,
} from "@/components/icons";
import type { Component } from "vue";

interface PlatformConfig {
  id: string;
  name: string;
  color: string;
  icon: Component;
  baseUrl: string;
  embedUrl: string;
  chatUrl: string;
  domains: string[];
}

export const PLATFORMS: Record<string, PlatformConfig> = {
  kick: {
    id: "kick",
    name: "Kick",
    color: "#53FC18",
    icon: KickIcon,
    baseUrl: "https://kick.com",
    embedUrl: "https://player.kick.com",
    chatUrl: "https://kick.com",
    domains: ["kick.com", "kick.start.gg"],
  },
  twitch: {
    id: "twitch",
    name: "Twitch",
    color: "#9146FF",
    icon: TwitchIcon,
    baseUrl: "https://twitch.tv",
    embedUrl: "https://player.twitch.tv",
    chatUrl: "https://www.twitch.tv/embed",
    domains: ["twitch.tv", "twitch.com"],
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
  },
};

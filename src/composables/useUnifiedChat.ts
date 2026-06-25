import { ref, computed, watch, onScopeDispose, reactive } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./useUpdater";
import { useStreams } from "./useStreams";
import { useTwitchAuth } from "./useTwitchAuth";

export const UNIFIED_CHAT_ID = "__unified_twitch__";
const MAX_FRONTEND_MESSAGES = 1_000;

export interface UnifiedChatMessage {
  id: string;
  channel: string;
  username: string;
  display_name: string;
  message: string;
  timestamp_ms: number;
  color: string | null;
  badges: string[];
  emotes: string | null;
  platform?: "twitch" | "kick";
  isPending?: boolean;
}

export type ConnectionState = "connected" | "reconnecting" | "disconnected";

interface ConnectionStateEvent {
  state: ConnectionState;
}

const CHANNEL_PALETTE = [
  "#FF0055", // Neon Pink
  "#00FFCC", // Cyan
  "#FF9900", // Bright Orange
  "#CCFF00", // Lime Yellow
  "#0066FF", // Electric Blue
  "#FF33FF", // Magenta
  "#33FF00", // Neon Green
  "#FF3300", // Bright Red
  "#B366FF", // Bright Purple
  "#00E5FF", // Cyan variant
  "#FFD700", // Gold
  "#FF0099", // Hot Pink
  "#00FFAA", // Mint Green
  "#FF6600", // Vivid Orange
  "#7B61FF", // Blurple
] as const;

const _useUnifiedChat = () => {
  const messages = ref<UnifiedChatMessage[]>([]);
  const connectionState = ref<ConnectionState>("disconnected");
  const channelAvatars = reactive<Record<string, string>>({});
  const { streams } = useStreams();
  const { authenticated } = useTwitchAuth();

  const assignedColors = new Map<string, string>();

  function channelColor(channel: string): string {
    const lowerChannel = channel.toLowerCase();
    if (assignedColors.has(lowerChannel)) {
      return assignedColors.get(lowerChannel)!;
    }

    const usedColors = new Set(assignedColors.values());
    const available = CHANNEL_PALETTE.filter((c) => !usedColors.has(c));

    let hash = 0;
    for (let i = 0; i < lowerChannel.length; i++) {
      hash = lowerChannel.charCodeAt(i) + ((hash << 5) - hash);
    }
    hash ^= hash >>> 16;
    hash ^= hash >>> 8;
    hash ^= hash >>> 3;
    const absHash = Math.abs(hash);

    let chosenColor: string;
    if (available.length > 0) {
      chosenColor = available[absHash % available.length]!;
    } else {
      chosenColor = CHANNEL_PALETTE[absHash % CHANNEL_PALETTE.length]!;
    }

    assignedColors.set(lowerChannel, chosenColor);
    return chosenColor;
  }

  const twitchChannels = computed(() =>
    streams.value.filter((s) => s.platform === "twitch").map((s) => s.channel.toLowerCase())
  );

  const kickChannels = computed(() =>
    streams.value.filter((s) => s.platform === "kick").map((s) => s.channel.toLowerCase())
  );

  let unlistenMessage: UnlistenFn | null = null;
  let unlistenKickMessage: UnlistenFn | null = null;
  let unlistenState: UnlistenFn | null = null;
  let unlistenAuthExpired: UnlistenFn | null = null;

  async function hydrateMessages() {
    if (!isTauri()) return;
    try {
      const existing = await invoke<UnifiedChatMessage[]>("twitch_get_messages");
      existing.forEach((m) => (m.platform = "twitch"));
      messages.value = existing.slice(-MAX_FRONTEND_MESSAGES);
    } catch {
      messages.value = [];
    }
  }

  async function syncChannels(channels: string[]) {
    if (!isTauri() || !authenticated.value) return;
    try {
      await invoke("twitch_set_channels", { channels });
    } catch (e) {
      console.error("[useUnifiedChat] failed to sync channels", e);
    }
  }

  async function sendMessage(channel: string, text: string) {
    if (!isTauri() || !authenticated.value) return;
    try {
      await invoke("twitch_send_message", { channel, text });
    } catch (e) {
      console.error("[useUnifiedChat] failed to send Twitch message", e);
      throw e;
    }
  }

  async function sendKickMessage(channelSlug: string, text: string) {
    if (!isTauri()) return;
    try {
      // 1. Resolve Kick channel slug -> broadcaster user_id via Frontend (bypasses Cloudflare)
      const res = await fetch(`https://kick.com/api/v1/channels/${channelSlug}`);
      if (!res.ok) throw new Error(`Channel fetch failed: ${res.status}`);
      const data = await res.json();
      const userId = data.user_id;

      // 2. Send authenticated message via Rust backend
      await invoke("kick_send_message", { broadcasterUserId: userId, message: text });
    } catch (e) {
      console.error("[useUnifiedChat] failed to send Kick message", e);
      throw e;
    }
  }

  async function init() {
    if (!isTauri()) return;

    let pendingMessages: UnifiedChatMessage[] = [];
    let flushTimer: any = null;

    const state = await invoke<{ state: ConnectionState }>("twitch_get_connection_state").catch(
      () => ({ state: "disconnected" as ConnectionState })
    );
    connectionState.value = state.state;

    await hydrateMessages();

    const localUnlistenMessage = await listen<UnifiedChatMessage>(
      "unified-chat-message",
      (event) => {
        const msg = event.payload;
        msg.platform = "twitch";

        if (msg.id.startsWith("local-")) {
          msg.isPending = true;
          setTimeout(() => {
            const found = messages.value.find((m) => m && m.id === msg.id);
            if (found) found.isPending = false;
          }, 1000);
        }

        pendingMessages.push(msg);
        if (!flushTimer) {
          flushTimer = setTimeout(() => {
            if (pendingMessages.length > 0) {
              messages.value.push(...pendingMessages);
              if (messages.value.length > MAX_FRONTEND_MESSAGES) {
                messages.value.splice(0, messages.value.length - MAX_FRONTEND_MESSAGES);
              }
              pendingMessages = [];
            }
            flushTimer = null;
          }, 50); // 50ms batching (20fps) to eliminate jitters
        }
      }
    );

    const localUnlistenKickMessage = await listen<UnifiedChatMessage>(
      "kick-chat-message",
      (event) => {
        const msg = event.payload;
        msg.platform = "kick";

        if (msg.id.startsWith("local-")) {
          msg.isPending = true;
          setTimeout(() => {
            const found = messages.value.find((m) => m && m.id === msg.id);
            if (found) found.isPending = false;
          }, 1000);
        } else {
          // De-duplicate local optimistic messages that were manually pushed by UnifiedChat.vue
          const pendingIdx = messages.value.findIndex(
            (m) =>
              m.isPending &&
              m.platform === "kick" &&
              m.channel === msg.channel &&
              m.username.toLowerCase() === msg.username.toLowerCase() &&
              m.message === msg.message
          );
          if (pendingIdx !== -1) {
            messages.value.splice(pendingIdx, 1);
          }
        }

        pendingMessages.push(msg);
        if (!flushTimer) {
          flushTimer = setTimeout(() => {
            if (pendingMessages.length > 0) {
              messages.value.push(...pendingMessages);
              if (messages.value.length > MAX_FRONTEND_MESSAGES) {
                messages.value.splice(0, messages.value.length - MAX_FRONTEND_MESSAGES);
              }
              pendingMessages = [];
            }
            flushTimer = null;
          }, 50); // 50ms batching (20fps) to eliminate jitters
        }
      }
    );

    const localUnlistenState = await listen<ConnectionStateEvent>(
      "twitch-connection-state",
      (event) => {
        connectionState.value = event.payload.state;
      }
    );

    const localUnlistenAuthExpired = await listen("twitch-auth-expired", () => {
      connectionState.value = "disconnected";
    });

    unlistenMessage = localUnlistenMessage;
    unlistenKickMessage = localUnlistenKickMessage;
    unlistenState = localUnlistenState;
    unlistenAuthExpired = localUnlistenAuthExpired;
  }

  watch(
    twitchChannels,
    (channels) => {
      syncChannels(channels);
      channels.forEach(async (channel) => {
        if (!channelAvatars[channel]) {
          try {
            const res = await fetch(
              `https://decapi.me/twitch/avatar/${encodeURIComponent(channel)}`
            );
            if (res.ok) {
              const url = await res.text();
              if (url.startsWith("http")) {
                channelAvatars[channel] = url.trim();
              }
            }
          } catch (e) {
            console.error(`[useUnifiedChat] Failed to fetch avatar for ${channel}`, e);
          }
        }
      });
    },
    { deep: true, immediate: true }
  );

  watch(
    kickChannels,
    (channels) => {
      channels.forEach(async (channel) => {
        if (!channelAvatars[channel]) {
          try {
            const res = await fetch(
              `https://kick.com/api/v2/channels/${encodeURIComponent(channel)}`
            );
            if (res.ok) {
              const data = await res.json();
              if (data?.user?.profile_pic) {
                channelAvatars[channel] = data.user.profile_pic;
              }
            }
          } catch (e) {
            console.error(`[useUnifiedChat] Failed to fetch avatar for Kick channel ${channel}`, e);
          }
        }
      });
    },
    { deep: true, immediate: true }
  );

  onScopeDispose(() => {
    unlistenMessage?.();
    unlistenKickMessage?.();
    unlistenState?.();
    unlistenAuthExpired?.();
  });

  watch(authenticated, (isAuth) => {
    if (isAuth) {
      syncChannels(twitchChannels.value);
    }
  });

  if (isTauri()) {
    init().catch(console.error);
  }

  function removeLastLocalMessage(channel: string, currentUsername: string): string | null {
    // Find the index of the last message by this user in this channel
    let lastIdx = -1;
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const m = messages.value[i];
      if (
        m &&
        m.channel === channel &&
        m.username.toLowerCase() === currentUsername.toLowerCase() &&
        m.isPending === true &&
        m.platform === "twitch"
      ) {
        lastIdx = i;
        break;
      }
    }

    if (lastIdx !== -1) {
      const removed = messages.value.splice(lastIdx, 1)[0];
      if (removed) {
        return removed.message;
      }
    }
    return null;
  }

  function removeLastLocalKickMessage(channel: string, currentUsername: string): string | null {
    // Same implementation but could differ if Kick uses different username casing rules
    let lastIdx = -1;
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const m = messages.value[i];
      if (
        m &&
        m.channel.toLowerCase() === channel.toLowerCase() &&
        m.username.toLowerCase() === currentUsername.toLowerCase() &&
        m.isPending === true &&
        m.platform === "kick"
      ) {
        lastIdx = i;
        break;
      }
    }

    if (lastIdx !== -1) {
      const removed = messages.value.splice(lastIdx, 1)[0];
      if (removed) {
        return removed.message;
      }
    }
    return null;
  }

  return {
    messages,
    connectionState,
    channelColor,
    channelAvatars,
    twitchChannels,
    kickChannels,
    sendMessage,
    sendKickMessage,
    removeLastLocalMessage,
    removeLastLocalKickMessage,
  };
};

export const useUnifiedChat = createSharedComposable(_useUnifiedChat);

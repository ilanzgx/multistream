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
  isPending?: boolean;
}

export type ConnectionState = "connected" | "reconnecting" | "disconnected";

interface ConnectionStateEvent {
  state: ConnectionState;
}

const CHANNEL_PALETTE = [
  "#9146FF",
  "#00B5AD",
  "#E91E63",
  "#FF6B35",
  "#2196F3",
  "#4CAF50",
  "#FF9800",
  "#9C27B0",
] as const;

function channelColor(channel: string): string {
  let hash = 0;
  for (let i = 0; i < channel.length; i++) {
    hash = (hash * 31 + channel.charCodeAt(i)) >>> 0;
  }
  return CHANNEL_PALETTE[hash % CHANNEL_PALETTE.length]!;
}

const _useUnifiedChat = () => {
  const messages = ref<UnifiedChatMessage[]>([]);
  const connectionState = ref<ConnectionState>("disconnected");
  const channelAvatars = reactive<Record<string, string>>({});
  const { streams } = useStreams();
  const { authenticated } = useTwitchAuth();

  const twitchChannels = computed(() =>
    streams.value.filter((s) => s.platform === "twitch").map((s) => s.channel.toLowerCase())
  );

  let unlistenMessage: UnlistenFn | null = null;
  let unlistenState: UnlistenFn | null = null;
  let unlistenAuthExpired: UnlistenFn | null = null;

  async function hydrateMessages() {
    if (!isTauri()) return;
    try {
      const existing = await invoke<UnifiedChatMessage[]>("twitch_get_messages");
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

      // Optimistically add the message to the list to feel fast
      // But Twitch IRC also reflects our own messages via WebSocket, so we might see it twice.
      // Actually, standard Twitch IRC might not reflect our own messages unless we have echo-message tag enabled.
      // For now, let's just let the Rust backend handle it and maybe we get it echoed, or we can push it optimistically.
      // Since we don't have our own local badges and color readily available, let's not push optimistically yet
      // to avoid weird UI glitches, or just push a minimal message if needed.
    } catch (e) {
      console.error("[useUnifiedChat] failed to send message", e);
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

  onScopeDispose(() => {
    unlistenMessage?.();
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
        m.isPending === true
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
    sendMessage,
    removeLastLocalMessage,
  };
};

export const useUnifiedChat = createSharedComposable(_useUnifiedChat);

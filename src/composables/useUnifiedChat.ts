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

  async function init() {
    if (!isTauri()) return;

    const state = await invoke<{ state: ConnectionState }>("twitch_get_connection_state").catch(
      () => ({ state: "disconnected" as ConnectionState })
    );
    connectionState.value = state.state;

    await hydrateMessages();

    let pendingMessages: UnifiedChatMessage[] = [];
    let flushTimer: any = null;

    unlistenMessage = await listen<UnifiedChatMessage>("unified-chat-message", (event) => {
      pendingMessages.push(event.payload);
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
    });

    unlistenState = await listen<ConnectionStateEvent>("twitch-connection-state", (event) => {
      connectionState.value = event.payload.state;
    });

    unlistenAuthExpired = await listen("twitch-auth-expired", () => {
      connectionState.value = "disconnected";
    });
  }

  watch(
    twitchChannels,
    (channels) => {
      syncChannels(channels);
      channels.forEach(async (channel) => {
        if (!channelAvatars[channel]) {
          try {
            const res = await fetch(`https://decapi.me/twitch/avatar/${channel}`);
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

  return {
    messages,
    connectionState,
    channelColor,
    channelAvatars,
    twitchChannels,
  };
};

export const useUnifiedChat = createSharedComposable(_useUnifiedChat);

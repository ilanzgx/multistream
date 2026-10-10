import { ref, shallowRef } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { API_CONFIG } from "@/config/api";
import { httpGet } from "@/lib/http";
import { useNetworkStatus } from "./useNetworkStatus";

export interface KickChatMessage {
  id: string;
  channel: string;
  username: string;
  display_name: string;
  message: string;
  timestamp_ms: number;
  color?: string | null;
  badges: string[];
  emotes?: string | null;
  isPending?: boolean;
  platform?: "kick";
}

const MAX_FRONTEND_MESSAGES = 500;
const BATCH_FLUSH_INTERVAL_MS = 50;

const activeKickChannels = new Map<string, number>(); // slug -> chatroom_id
const activeBroadcasters = new Map<string, number>(); // slug -> broadcaster_user_id
const pendingJoinControllers = new Map<string, AbortController>(); // slug -> AbortController

let pendingMessages: KickChatMessage[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const channelMessagesMap = shallowRef<Record<string, KickChatMessage[]>>({});
const connectionState = ref<"connected" | "disconnected" | "reconnecting">("disconnected");

let isListening = false;
let unlistenState: (() => void) | null = null;
let unlistenMessage: (() => void) | null = null;

export function flushPendingKickMessages() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pendingMessages.length === 0) return;

  const batch = pendingMessages;
  pendingMessages = [];

  const newMap = { ...channelMessagesMap.value };
  let mapChanged = false;

  const byChannel = new Map<string, KickChatMessage[]>();
  for (const msg of batch) {
    const chan = msg.channel.toLowerCase();
    const list = byChannel.get(chan) || [];
    list.push(msg);
    byChannel.set(chan, list);
  }

  for (const [chan, msgs] of byChannel.entries()) {
    const existing = newMap[chan] ? [...newMap[chan]] : [];

    for (const msg of msgs) {
      const pendingIdx = existing.findIndex(
        (m) =>
          m.isPending &&
          m.username.toLowerCase() === msg.username.toLowerCase() &&
          m.message === msg.message
      );

      if (pendingIdx !== -1) {
        existing.splice(pendingIdx, 1);
      }

      existing.unshift(msg);
    }

    if (existing.length > MAX_FRONTEND_MESSAGES) {
      existing.length = MAX_FRONTEND_MESSAGES;
    }

    newMap[chan] = existing;
    mapChanged = true;
  }

  if (mapChanged) {
    channelMessagesMap.value = newMap;
  }
}

export function __test_resetKickChatState() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  pendingMessages = [];
  activeKickChannels.clear();
  activeBroadcasters.clear();
  pendingJoinControllers.forEach((controller) => controller.abort());
  pendingJoinControllers.clear();
  channelMessagesMap.value = {};
  connectionState.value = "disconnected";

  if (unlistenState) {
    unlistenState();
    unlistenState = null;
  }
  if (unlistenMessage) {
    unlistenMessage();
    unlistenMessage = null;
  }
  isListening = false;
}

async function setupListeners() {
  if (isListening) return;
  isListening = true;

  try {
    unlistenState = await listen<{ state: "connected" | "disconnected" | "reconnecting" }>(
      "kick-connection-state",
      (event) => {
        connectionState.value = event.payload.state;
      }
    );

    unlistenMessage = await listen<KickChatMessage>("kick-chat-message", (event) => {
      const msg = event.payload;
      msg.platform = "kick";
      pendingMessages.push(msg);

      if (!flushTimer) {
        flushTimer = setTimeout(flushPendingKickMessages, BATCH_FLUSH_INTERVAL_MS);
      }
    });
  } catch (err) {
    console.error("Failed to setup Kick chat listeners:", err);
  }
}

async function updateSubscriptions() {
  const channels = Array.from(activeKickChannels.entries()).map(([slug, id]) => [slug, id]);
  await invoke("kick_set_channels", { channels });
}

const { onReconnect } = useNetworkStatus();
onReconnect(async () => {
  if (activeKickChannels.size > 0) {
    try {
      await updateSubscriptions();
    } catch (e) {
      console.error("[useKickChat] Failed to resubscribe channels on reconnect", e);
    }
  }
});

export function useKickChat(channelSlug: string) {
  setupListeners();

  const isJoining = ref(false);

  async function joinChannel() {
    const slug = channelSlug.trim().toLowerCase();
    if (!slug || activeKickChannels.has(slug) || pendingJoinControllers.has(slug)) return;

    isJoining.value = true;
    const controller = new AbortController();
    pendingJoinControllers.set(slug, controller);
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await httpGet(API_CONFIG.kick.apiV1Url(slug), undefined, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!res.ok) throw new Error("Channel not found");
      const data = await res.json();
      if (controller.signal.aborted) return;
      const chatroomId = data.chatroom?.id;

      if (chatroomId) {
        activeKickChannels.set(slug, chatroomId);
        if (data.user_id) {
          activeBroadcasters.set(slug, data.user_id);
        }
        await updateSubscriptions();
      }
    } catch (e: unknown) {
      if (controller.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
        return;
      }
      console.error("Failed to fetch Kick chatroom ID for", slug, e);
    } finally {
      clearTimeout(timeoutId);
      pendingJoinControllers.delete(slug);
      isJoining.value = false;
    }
  }

  async function leaveChannel() {
    const slug = channelSlug.trim().toLowerCase();
    const pendingController = pendingJoinControllers.get(slug);
    if (pendingController) {
      pendingController.abort();
      pendingJoinControllers.delete(slug);
    }

    if (activeKickChannels.has(slug)) {
      activeKickChannels.delete(slug);
      activeBroadcasters.delete(slug);
      await updateSubscriptions();
    }
  }

  function removeLastLocalMessage(username: string): string | null {
    flushPendingKickMessages();
    const chan = channelSlug.toLowerCase();
    const existing = channelMessagesMap.value[chan] || [];
    let idx = -1;
    for (let i = 0; i < existing.length; i++) {
      const m = existing[i];
      if (m && m.username.toLowerCase() === username.toLowerCase() && m.isPending) {
        idx = i;
        break;
      }
    }
    if (idx !== -1) {
      const msg = existing[idx];
      if (!msg) return null;
      const newMsgs = [...existing];
      newMsgs.splice(idx, 1);
      channelMessagesMap.value = {
        ...channelMessagesMap.value,
        [chan]: newMsgs,
      };
      return msg.message;
    }
    return null;
  }

  function getBroadcasterUserId() {
    const slug = channelSlug.trim().toLowerCase();
    return activeBroadcasters.get(slug) ?? null;
  }

  function addLocalMessage(msg: KickChatMessage) {
    flushPendingKickMessages();
    const chan = channelSlug.toLowerCase();
    const existing = channelMessagesMap.value[chan] || [];
    channelMessagesMap.value = {
      ...channelMessagesMap.value,
      [chan]: [msg, ...existing],
    };
  }

  return {
    channelMessagesMap,
    connectionState,
    isJoining,
    joinChannel,
    leaveChannel,
    removeLastLocalMessage,
    addLocalMessage,
    getBroadcasterUserId,
  };
}

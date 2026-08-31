import { ref, shallowRef } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { API_CONFIG } from "@/config/api";

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

export function useKickChat(channelSlug: string) {
  setupListeners();

  async function joinChannel() {
    if (activeKickChannels.has(channelSlug) || pendingJoinControllers.has(channelSlug)) return;

    const controller = new AbortController();
    pendingJoinControllers.set(channelSlug, controller);

    try {
      const res = await fetch(API_CONFIG.kick.apiV1Url(channelSlug), {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!res.ok) throw new Error("Channel not found");
      const data = await res.json();
      if (controller.signal.aborted) return;
      const chatroomId = data.chatroom?.id;

      if (chatroomId) {
        activeKickChannels.set(channelSlug, chatroomId);
        if (data.user_id) {
          activeBroadcasters.set(channelSlug, data.user_id);
        }
        await updateSubscriptions();
      }
    } catch (e: unknown) {
      if (controller.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
        return;
      }
      console.error("Failed to fetch Kick chatroom ID for", channelSlug, e);
    } finally {
      pendingJoinControllers.delete(channelSlug);
    }
  }

  async function leaveChannel() {
    const pendingController = pendingJoinControllers.get(channelSlug);
    if (pendingController) {
      pendingController.abort();
      pendingJoinControllers.delete(channelSlug);
    }

    if (activeKickChannels.has(channelSlug)) {
      activeKickChannels.delete(channelSlug);
      activeBroadcasters.delete(channelSlug);
      await updateSubscriptions();
    }
  }

  async function updateSubscriptions() {
    const channels = Array.from(activeKickChannels.entries()).map(([slug, id]) => [slug, id]);
    await invoke("kick_set_channels", { channels });
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
    return activeBroadcasters.get(channelSlug) ?? null;
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
    joinChannel,
    leaveChannel,
    removeLastLocalMessage,
    addLocalMessage,
    getBroadcasterUserId,
  };
}

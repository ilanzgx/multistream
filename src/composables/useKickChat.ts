import { ref, shallowRef } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface KickChatMessage {
  id: string;
  channel: string;
  username: string;
  display_name: string;
  message: string;
  timestamp_ms: number;
  color?: string;
  badges: string[];
  emotes?: string;
  isPending?: boolean;
  platform?: "kick";
}

const MAX_FRONTEND_MESSAGES = 500;

const activeKickChannels = new Map<string, number>(); // slug -> chatroom_id
const activeBroadcasters = new Map<string, number>(); // slug -> broadcaster_user_id

export function __test_resetKickChatState() {
  activeKickChannels.clear();
  activeBroadcasters.clear();
}

const channelMessagesMap = shallowRef<Record<string, KickChatMessage[]>>({});
const connectionState = ref<"connected" | "disconnected" | "reconnecting">("disconnected");

let isListening = false;

async function setupListeners() {
  if (isListening) return;
  isListening = true;

  await listen<{ state: "connected" | "disconnected" | "reconnecting" }>(
    "kick-connection-state",
    (event) => {
      connectionState.value = event.payload.state;
    }
  ).catch(console.error);

  await listen<KickChatMessage>("kick-chat-message", (event) => {
    const msg = event.payload;
    msg.platform = "kick";

    const chan = msg.channel.toLowerCase();
    const existing = channelMessagesMap.value[chan] || [];

    const pendingIdx = existing.findIndex(
      (m) =>
        m.isPending &&
        m.username.toLowerCase() === msg.username.toLowerCase() &&
        m.message === msg.message
    );

    const newMsgs = [...existing];
    if (pendingIdx !== -1) {
      newMsgs.splice(pendingIdx, 1);
    }

    newMsgs.push(msg);
    if (newMsgs.length > MAX_FRONTEND_MESSAGES) {
      newMsgs.splice(0, newMsgs.length - MAX_FRONTEND_MESSAGES);
    }

    channelMessagesMap.value = {
      ...channelMessagesMap.value,
      [chan]: newMsgs,
    };
  }).catch(console.error);
}

export function useKickChat(channelSlug: string) {
  setupListeners();

  async function joinChannel() {
    if (activeKickChannels.has(channelSlug)) return;

    try {
      const res = await fetch(`https://kick.com/api/v1/channels/${channelSlug}`);
      if (!res.ok) throw new Error("Channel not found");
      const data = await res.json();
      const chatroomId = data.chatroom.id;

      activeKickChannels.set(channelSlug, chatroomId);
      activeBroadcasters.set(channelSlug, data.user_id);
      await updateSubscriptions();
    } catch (e) {
      console.error("Failed to fetch Kick chatroom ID for", channelSlug, e);
    }
  }

  async function leaveChannel() {
    if (activeKickChannels.has(channelSlug)) {
      activeKickChannels.delete(channelSlug);
      await updateSubscriptions();
    }
  }

  async function updateSubscriptions() {
    const channels = Array.from(activeKickChannels.entries()).map(([slug, id]) => [slug, id]);
    await invoke("kick_set_channels", { channels });
  }

  function removeLastLocalMessage(username: string): string | null {
    const chan = channelSlug.toLowerCase();
    const existing = channelMessagesMap.value[chan] || [];
    let idx = -1;
    for (let i = existing.length - 1; i >= 0; i--) {
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
    const chan = channelSlug.toLowerCase();
    const existing = channelMessagesMap.value[chan] || [];
    channelMessagesMap.value = {
      ...channelMessagesMap.value,
      [chan]: [...existing, msg],
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

import { ref } from "vue";
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

const activeKickChannels = new Map<string, number>(); // slug -> chatroom_id
const activeBroadcasters = new Map<string, number>(); // slug -> broadcaster_user_id

export function __test_resetKickChatState() {
  activeKickChannels.clear();
  activeBroadcasters.clear();
}

const messages = ref<KickChatMessage[]>([]);
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

    const pendingIdx = messages.value.findIndex(
      (m) =>
        m.isPending &&
        m.channel === msg.channel &&
        m.username.toLowerCase() === msg.username.toLowerCase() &&
        m.message === msg.message
    );
    if (pendingIdx !== -1) {
      messages.value.splice(pendingIdx, 1);
    }

    messages.value.push(msg);
    if (messages.value.length > 500) {
      messages.value.shift();
    }
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
    let idx = -1;
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const m = messages.value[i];
      if (
        m &&
        m.channel === channelSlug &&
        m.username.toLowerCase() === username.toLowerCase() &&
        m.isPending
      ) {
        idx = i;
        break;
      }
    }
    if (idx !== -1) {
      const msg = messages.value[idx];
      if (!msg) return null;
      messages.value.splice(idx, 1);
      return msg.message;
    }
    return null;
  }

  function getBroadcasterUserId() {
    return activeBroadcasters.get(channelSlug) ?? null;
  }

  function addLocalMessage(msg: KickChatMessage) {
    messages.value.push(msg);
  }

  return {
    messages,
    connectionState,
    joinChannel,
    leaveChannel,
    removeLastLocalMessage,
    addLocalMessage,
    getBroadcasterUserId,
  };
}

<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { Send, WifiOff, RefreshCw } from "lucide-vue-next";
import { useKickChat } from "@/composables/useKickChat";
import { useEmotes } from "@/composables/useEmotes";
import { Button } from "@/components/ui/button";
import ChatRichInput from "./ChatRichInput.vue";
import UnifiedChatMessage from "./UnifiedChatMessage.vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "vue-sonner";
import { useKickAuth } from "@/composables/useKickAuth";
import { useI18n } from "vue-i18n";
import LoginPrompt from "./LoginPrompt.vue";

const props = defineProps<{ channel: string }>();

const {
  messages,
  connectionState,
  joinChannel,
  leaveChannel,
  removeLastLocalMessage,
  addLocalMessage,
  getBroadcasterUserId,
} = useKickChat(props.channel);
const { username, authenticated, loading: authLoading } = useKickAuth();
const { encodeKickMessage, getEmoteDictionary, loadChannelEmotes } = useEmotes();
const { t } = useI18n();

function openAuthModal() {
  window.dispatchEvent(new CustomEvent("multistream-show-dialog", { detail: "kick-auth" }));
}

const channelMessages = computed(() =>
  [...messages.value]
    .filter((m) => m.channel.toLowerCase() === props.channel.toLowerCase())
    .toReversed()
);

async function sendKickMessage(channel: string, message: string) {
  const pendingId = `pending-${Date.now()}`;
  const encodedMessage = encodeKickMessage(message, channel);

  addLocalMessage({
    id: pendingId,
    channel,
    username: username.value || "You",
    display_name: username.value || "You",
    message: encodedMessage,
    timestamp_ms: Date.now(),
    badges: [],
    isPending: true,
    platform: "kick",
  });

  try {
    let broadcaster_user_id = getBroadcasterUserId();
    if (!broadcaster_user_id) {
      const res = await fetch(`https://kick.com/api/v1/channels/${channel}`);
      if (!res.ok) throw new Error("Channel not found");
      const data = await res.json();
      broadcaster_user_id = data.user_id;
    }

    await invoke("kick_send_message", {
      broadcasterUserId: broadcaster_user_id,
      message: encodedMessage,
    });
  } catch (error) {
    removeLastLocalMessage(username.value || "You");
    throw error;
  }
}

const newMessage = ref("");
const isSending = ref(false);

async function handleSend() {
  const text = newMessage.value.trim();
  if (!text) return;

  isSending.value = true;
  try {
    await sendKickMessage(props.channel, text);
    newMessage.value = "";
  } catch (error) {
    console.error("Failed to send message", error);
    toast.error(typeof error === "string" ? error : t("chat.sendError"));
  } finally {
    isSending.value = false;
  }
}

let unlistenError: UnlistenFn | null = null;

onMounted(async () => {
  await Promise.all([joinChannel(), loadChannelEmotes(props.channel)]);
  unlistenError = await listen<{ channel: string; message: string }>("kick-chat-error", (event) => {
    const { channel, message } = event.payload;
    if (channel.toLowerCase() === props.channel.toLowerCase()) {
      if (username.value) {
        const lastText = removeLastLocalMessage(username.value);
        if (lastText) {
          toast.error(message);
          newMessage.value = lastText;
        }
      }
    }
  });
});

onUnmounted(async () => {
  if (unlistenError) {
    unlistenError();
  }
  await leaveChannel();
});
</script>

<template>
  <div class="flex flex-col h-full bg-[#0f1115]">
    <div
      v-if="connectionState === 'reconnecting'"
      class="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-400 text-[11px] font-medium shrink-0"
    >
      <RefreshCw class="w-3 h-3 animate-spin" />
      {{ t("chat.unified.reconnecting") }}
    </div>

    <div
      v-if="connectionState === 'disconnected' && channelMessages.length === 0"
      class="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <WifiOff class="w-8 h-8 text-gray-600" />
      <p class="text-sm text-gray-400">{{ t("chat.unified.disconnected") }}</p>
    </div>

    <div
      v-else
      class="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar py-1 flex flex-col-reverse"
    >
      <UnifiedChatMessage
        v-for="msg in channelMessages"
        :key="msg.id"
        :message="{
          ...msg,
          color: msg.color ?? null,
          emotes: msg.emotes ?? null,
        }"
        :channel-color="'#53fc18'"
        compact
      />
    </div>

    <!-- Message Input Area or Login Prompt -->
    <LoginPrompt
      v-if="!authenticated"
      platform="kick"
      :loading="authLoading"
      @connect="openAuthModal"
    />

    <div v-else class="p-3 border-t border-[#2a2d33] bg-[#0f1115] shrink-0">
      <form class="flex items-end gap-2" @submit.prevent="handleSend">
        <ChatRichInput
          v-model="newMessage"
          :emotes="getEmoteDictionary(channel, 'kick')"
          :placeholder="t('chat.sendPlaceholder')"
          :disabled="connectionState !== 'connected' || isSending"
          class="focus:ring-[#53fc18]"
          @submit="handleSend"
        />
        <Button
          type="submit"
          size="icon"
          class="shrink-0 h-[38px] w-[38px] bg-[#53fc18] hover:bg-[#6afc35] text-[#0f1115] disabled:opacity-50"
          :disabled="!newMessage.trim() || connectionState !== 'connected' || isSending"
        >
          <Send class="w-4 h-4" />
        </Button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #2a2d33;
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #3a3f4b;
}
</style>

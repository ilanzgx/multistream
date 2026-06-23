<script lang="ts" setup>
import { ref, computed } from "vue";
import { Send, WifiOff, RefreshCw } from "lucide-vue-next";
import { useUnifiedChat } from "@/composables/useUnifiedChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UnifiedChatMessage from "./UnifiedChatMessage.vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "vue-sonner";
import { useTwitchAuth } from "@/composables/useTwitchAuth";
import { useI18n } from "vue-i18n";

const props = defineProps<{ channel: string }>();

const {
  messages,
  connectionState,
  channelColor,
  channelAvatars,
  sendMessage,
  removeLastLocalMessage,
} = useUnifiedChat();
const { username } = useTwitchAuth();
const { t } = useI18n();

const channelMessages = computed(() =>
  [...messages.value].filter((m) => m.channel === props.channel).toReversed()
);

const newMessage = ref("");
const isSending = ref(false);

async function handleSend() {
  const text = newMessage.value.trim();
  if (!text) return;

  isSending.value = true;
  try {
    await sendMessage(props.channel, text);
    newMessage.value = "";
  } catch (error) {
    console.error("Failed to send message", error);
  } finally {
    isSending.value = false;
  }
}

let unlistenError: UnlistenFn | null = null;

import { onMounted, onUnmounted } from "vue";

onMounted(async () => {
  unlistenError = await listen<{ channel: string; message: string }>(
    "twitch-chat-error",
    (event) => {
      const { channel, message } = event.payload;
      if (channel === props.channel) {
        if (username.value) {
          const lastText = removeLastLocalMessage(channel, username.value);
          if (lastText) {
            toast.error(message);
            newMessage.value = lastText;
          }
        }
      }
    }
  );
});

onUnmounted(() => {
  if (unlistenError) {
    unlistenError();
  }
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
        :message="msg"
        :channel-color="channelColor(msg.channel)"
        :channel-avatar="channelAvatars[msg.channel]"
        compact
      />
    </div>

    <!-- Message Input Area -->
    <div class="p-3 border-t border-[#2a2d33] bg-[#0f1115] shrink-0">
      <form class="flex gap-2" @submit.prevent="handleSend">
        <Input
          v-model="newMessage"
          :placeholder="t('chat.sendPlaceholder')"
          class="flex-1 bg-[#1a1d24] border-[#2a2d33] text-sm text-gray-200 placeholder:text-gray-500 focus-visible:ring-[#9146FF]"
          :disabled="connectionState !== 'connected' || isSending"
        />
        <Button
          type="submit"
          size="icon"
          class="shrink-0 bg-[#9146FF] hover:bg-[#a970ff] text-white disabled:opacity-50"
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

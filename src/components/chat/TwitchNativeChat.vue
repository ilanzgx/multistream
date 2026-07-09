<script lang="ts" setup>
import { ref, computed } from "vue";
import { Send, WifiOff, RefreshCw, ArrowDown } from "@lucide/vue";
import { useUnifiedChat } from "@/composables/useUnifiedChat";
import { useEmotes } from "@/composables/useEmotes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ChatRichInput from "./ChatRichInput.vue";
import UnifiedChatMessage from "./UnifiedChatMessage.vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "vue-sonner";
import { useTwitchAuth } from "@/composables/useTwitchAuth";
import { useI18n } from "vue-i18n";
import { TwitchIcon } from "@/components/icons";

const props = defineProps<{ channel: string }>();

const {
  channelMessagesMap,
  connectionState,
  channelColor,
  channelAvatars,
  sendMessage,
  removeLastLocalMessage,
} = useUnifiedChat();
const { username } = useTwitchAuth();
const { t } = useI18n();
const { getEmoteDictionary, loadChannelEmotes } = useEmotes();

const channelMessages = computed(() =>
  (channelMessagesMap.value[props.channel.toLowerCase()] || []).toReversed()
);

const channelEmotes = computed(() => getEmoteDictionary(props.channel, "twitch"));

const newMessage = ref("");
const isSending = ref(false);
const isInitializing = ref(true);

const scrollContainer = ref<HTMLElement | null>(null);
const isScrolledUp = ref(false);

function handleScroll() {
  if (scrollContainer.value) {
    isScrolledUp.value = Math.abs(scrollContainer.value.scrollTop) > 50;
  }
}

function scrollToBottom() {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 0;
    isScrolledUp.value = false;
  }
}

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
  await loadChannelEmotes(props.channel);
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

  setTimeout(() => {
    isInitializing.value = false;
  }, 800);
});

onUnmounted(() => {
  if (unlistenError) {
    unlistenError();
  }
});
</script>

<template>
  <div class="flex flex-col h-full bg-[#0f1115] relative">
    <Transition name="fade">
      <div
        v-if="isInitializing"
        class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#0f1115] p-6"
      >
        <TwitchIcon :size="48" :style="{ color: '#9146FF' }" class="opacity-30" />
        <div class="flex flex-col gap-2 w-full">
          <Skeleton class="h-2.5 w-3/4 mx-auto bg-white/5 rounded" />
          <Skeleton class="h-2.5 w-1/2 mx-auto bg-white/5 rounded" />
          <Skeleton class="h-2.5 w-2/3 mx-auto bg-white/5 rounded" />
        </div>
      </div>
    </Transition>

    <div
      v-if="connectionState === 'reconnecting'"
      class="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-400 text-[11px] font-medium shrink-0"
    >
      <RefreshCw class="w-3 h-3 animate-spin" />
      {{ t("chat.unified.reconnecting") }}
    </div>

    <div
      v-else-if="connectionState === 'disconnected' && channelMessages.length === 0"
      class="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <WifiOff class="w-8 h-8 text-gray-600" />
      <p class="text-sm text-gray-400">{{ t("chat.unified.disconnected") }}</p>
    </div>

    <div v-else class="flex-1 relative min-h-0">
      <div
        ref="scrollContainer"
        class="absolute inset-0 overflow-y-auto overflow-x-hidden custom-scrollbar py-1 flex flex-col-reverse"
        @scroll="handleScroll"
      >
        <UnifiedChatMessage
          v-for="msg in channelMessages"
          :key="msg.id"
          :message="msg"
          :is-pending="msg.isPending"
          :channel-color="channelColor(msg.channel)"
          :channel-avatar="channelAvatars[msg.channel]"
          compact
        />
      </div>

      <Transition name="fade">
        <div v-if="isScrolledUp" class="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
          <Button
            variant="secondary"
            size="sm"
            class="bg-[#1f232b]/95 hover:bg-[#2a2d33] text-gray-200 border border-white/10 shadow-lg rounded-full px-4 flex items-center gap-2 font-medium backdrop-blur-sm"
            @click="scrollToBottom"
          >
            {{ t("chat.resume") }}
            <ArrowDown class="w-4 h-4" />
          </Button>
        </div>
      </Transition>
    </div>

    <!-- Message Input Area -->
    <div class="p-3 border-t border-[#2a2d33] bg-[#0f1115] shrink-0">
      <form class="flex items-end gap-2" @submit.prevent="handleSend">
        <ChatRichInput
          v-model="newMessage"
          :emotes="channelEmotes"
          :placeholder="t('chat.sendPlaceholder')"
          :disabled="connectionState !== 'connected' || isSending"
          class="focus:ring-[#9146FF]"
          @submit="handleSend"
        />
        <Button
          type="submit"
          size="icon"
          class="shrink-0 h-[38px] w-[38px] bg-[#9146FF] hover:bg-[#a970ff] text-white disabled:opacity-50"
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
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-leave-to {
  opacity: 0;
}
</style>

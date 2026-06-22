<script lang="ts" setup>
import { watch, computed } from "vue";
import { WifiOff, RefreshCw, MessageSquare, Twitch } from "lucide-vue-next";
import { useUnifiedChat } from "@/composables/useUnifiedChat";
import { useTwitchAuth } from "@/composables/useTwitchAuth";
import { useEmotes } from "@/composables/useEmotes";
import { Button } from "@/components/ui/button";
import UnifiedChatMessage from "./UnifiedChatMessage.vue";
import { useI18n } from "vue-i18n";
import { TwitchIcon } from "../icons";

const { messages, connectionState, channelColor, channelAvatars, twitchChannels } =
  useUnifiedChat();
const { authenticated, loading: authLoading } = useTwitchAuth();
const { t } = useI18n();
const { loadChannelEmotes } = useEmotes();

const reversedMessages = computed(() => [...messages.value].toReversed());
const hasTwitchStreams = computed(() => twitchChannels.value.length > 0);

function openAuthModal() {
  window.dispatchEvent(new CustomEvent("multistream-show-dialog", { detail: "twitch-auth" }));
}

watch(
  twitchChannels,
  (channels) => {
    channels.forEach((channel) => loadChannelEmotes(channel));
  },
  { immediate: true, deep: true }
);
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

    <template v-if="!authenticated">
      <div class="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div class="flex items-center justify-center w-12 h-12 rounded-xl">
          <TwitchIcon :size="36" :style="{ color: '#9146FF' }" />
        </div>
        <div class="text-center space-y-1">
          <p class="font-medium text-gray-200">{{ $t("chat.unified.connectTitle") }}</p>
          <p class="text-sm text-gray-500">{{ $t("chat.unified.connectHint") }}</p>
        </div>
        <div class="pt-2">
          <Button
            variant="outline"
            class="border-[#2a2d33] text-[#bf94ff] hover:bg-[#2a2d33] hover:text-white transition-all bg-transparent"
            :disabled="authLoading"
            @click="openAuthModal"
          >
            <Twitch class="w-4 h-4 mr-2" />
            {{ t("chat.unified.connectButton") }}
          </Button>
        </div>
      </div>
    </template>

    <template v-else-if="!hasTwitchStreams">
      <div class="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <MessageSquare class="w-8 h-8 text-gray-600" />
        <p class="text-sm text-gray-500">{{ t("chat.unified.noTwitchStreams") }}</p>
        <p class="text-xs text-gray-600">{{ t("chat.unified.noTwitchStreamsHint") }}</p>
      </div>
    </template>

    <template v-else-if="connectionState === 'disconnected' && messages.length === 0">
      <div class="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <WifiOff class="w-8 h-8 text-gray-600" />
        <p class="text-sm text-gray-500">{{ t("chat.unified.disconnected") }}</p>
      </div>
    </template>

    <template v-else>
      <div
        class="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar py-1 flex flex-col-reverse"
      >
        <UnifiedChatMessage
          v-for="msg in reversedMessages"
          :key="msg.id"
          :message="msg"
          :channel-color="channelColor(msg.channel)"
          :channel-avatar="channelAvatars[msg.channel]"
        />
      </div>
    </template>
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

<script lang="ts" setup>
import { watch, computed, ref } from "vue";
import { WifiOff, RefreshCw } from "@lucide/vue";
import { useUnifiedChatState } from "@/composables/useUnifiedChatState";
import { useUnifiedChat } from "@/composables/useUnifiedChat";
import { useTwitchAuth } from "@/composables/useTwitchAuth";
import { useEmotes } from "@/composables/useEmotes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import UnifiedChatMessage from "./UnifiedChatMessage.vue";
import { useI18n } from "vue-i18n";
import { TwitchIcon } from "../icons";
import LoginPrompt from "./LoginPrompt.vue";
const { messages, connectionState, channelColor, channelAvatars, twitchChannels } =
  useUnifiedChat();
const { loading: authLoading } = useTwitchAuth();
const { t } = useI18n();
const { loadChannelEmotes } = useEmotes();
const { unifiedChatState } = useUnifiedChatState();

const reversedMessages = computed(() => [...messages.value].toReversed());
function openAuthModal() {
  window.dispatchEvent(new CustomEvent("multistream-show-dialog", { detail: "twitch-auth" }));
}

const isInitializing = ref(true);

watch(
  twitchChannels,
  (channels) => {
    channels.forEach((channel) => loadChannelEmotes(channel));
  },
  { immediate: true, deep: true }
);

import { onMounted } from "vue";
onMounted(() => {
  setTimeout(() => {
    isInitializing.value = false;
  }, 800);
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

    <template v-if="unifiedChatState.warningType === 'full'">
      <div class="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div class="flex items-center justify-center w-12 h-12 rounded-xl">
          <TwitchIcon :size="36" :style="{ color: '#9146FF' }" />
        </div>
        <div class="text-center space-y-1">
          <p class="font-medium text-gray-200">{{ $t("chat.unified.connectTitle") }}</p>
          <p class="text-sm text-gray-400">{{ $t(unifiedChatState.warningMessage) }}</p>
        </div>
        <div class="pt-2">
          <Button
            variant="outline"
            class="border-[#2a2d33] text-[#bf94ff] hover:bg-[#2a2d33] hover:text-white transition-all bg-transparent"
            :disabled="authLoading"
            @click="openAuthModal"
          >
            <TwitchIcon class="w-4 h-4 mr-2" />
            {{ t("chat.unified.connectButton") }}
          </Button>
        </div>
      </div>
    </template>

    <template
      v-else-if="
        connectionState === 'disconnected' &&
        messages.length === 0 &&
        unifiedChatState.activePlatforms.length === 0
      "
    >
      <div class="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <WifiOff class="w-8 h-8 text-gray-600" />
        <p class="text-sm text-gray-400">{{ t("chat.unified.disconnected") }}</p>
      </div>
    </template>

    <template v-else>
      <div
        class="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pt-1 flex flex-col-reverse"
      >
        <LoginPrompt
          v-if="unifiedChatState.warningType === 'banner'"
          platform="twitch"
          position="top"
          :subtitle-key="unifiedChatState.warningMessage"
          :loading="authLoading"
          @connect="openAuthModal"
        />

        <UnifiedChatMessage
          v-for="msg in reversedMessages"
          :key="msg.id"
          :message="msg"
          :is-pending="msg.isPending"
          :channel-color="channelColor(msg.channel)"
          :channel-avatar="channelAvatars[msg.channel]"
          :show-platform-icon="true"
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
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-leave-to {
  opacity: 0;
}
</style>

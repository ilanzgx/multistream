<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { KickIcon, TwitchIcon } from "@/components/icons";

defineProps<{
  platform: "twitch" | "kick";
  loading?: boolean;
  position?: "top" | "bottom";
  subtitleKey?: string;
}>();

const emit = defineEmits<{
  (e: "connect"): void;
}>();
</script>

<template>
  <div
    class="p-3 bg-[#14161a] shrink-0 flex items-center justify-between gap-3"
    :class="position === 'top' ? 'border-b border-[#2a2d33]' : 'border-t border-[#2a2d33]'"
  >
    <div class="flex items-center gap-2.5 overflow-hidden">
      <div
        class="w-8 h-8 rounded-lg bg-[#1e2127] border border-[#2a2d33] flex items-center justify-center shrink-0"
      >
        <TwitchIcon v-if="platform === 'twitch'" :size="16" :style="{ color: '#9146FF' }" />
        <KickIcon v-else :size="16" :style="{ color: '#53fc18' }" />
      </div>
      <div class="flex flex-col overflow-hidden leading-tight">
        <span class="text-xs font-medium text-gray-200 truncate">{{ $t("chat.loginPrompt") }}</span>
        <span class="text-[10px] text-gray-400 truncate mt-0.5">
          {{
            subtitleKey
              ? $t(subtitleKey)
              : platform === "twitch"
                ? $t("chat.loginPromptTwitch")
                : $t("chat.loginPromptKick")
          }}
        </span>
      </div>
    </div>
    <Button
      variant="outline"
      size="sm"
      class="h-8 px-3.5 text-xs font-medium transition-all shrink-0 border-[#2a2d33] bg-[#1e2127]"
      :class="[
        platform === 'twitch'
          ? 'text-[#bf94ff] hover:bg-[#9146FF]/10 hover:text-white hover:border-[#9146FF]/40'
          : 'text-[#53fc18] hover:bg-[#53fc18]/10 hover:text-white hover:border-[#53fc18]/40',
      ]"
      :disabled="loading"
      @click="emit('connect')"
    >
      {{ $t("chat.connectAction") }}
    </Button>
  </div>
</template>

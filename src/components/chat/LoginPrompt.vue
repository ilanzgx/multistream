<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { KickIcon, TwitchIcon } from "@/components/icons";

defineProps<{
  platform: "twitch" | "kick";
  loading?: boolean;
  position?: "top" | "bottom";
  titleKey?: string;
  subtitleKey?: string;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: "connect"): void;
}>();
</script>

<template>
  <div
    class="bg-[#14161a] shrink-0 flex items-center justify-between"
    :class="[
      position === 'top' ? 'border-b border-[#2a2d33]' : 'border-t border-[#2a2d33]',
      compact ? 'p-2 gap-2' : 'p-3 gap-3',
    ]"
  >
    <div class="flex items-center overflow-hidden" :class="compact ? 'gap-1.5' : 'gap-2.5'">
      <div
        class="rounded-lg bg-[#1e2127] border border-[#2a2d33] flex items-center justify-center shrink-0"
        :class="compact ? 'w-6 h-6' : 'w-8 h-8'"
      >
        <TwitchIcon
          v-if="platform === 'twitch'"
          :size="compact ? 12 : 16"
          :style="{ color: '#9146FF' }"
        />
        <KickIcon v-else :size="compact ? 12 : 16" :style="{ color: '#53fc18' }" />
      </div>
      <div class="flex flex-col overflow-hidden leading-tight">
        <span
          class="font-medium text-gray-200 truncate"
          :class="compact ? 'text-[11px]' : 'text-xs'"
        >
          {{ titleKey ? $t(titleKey) : $t("chat.loginPrompt") }}
        </span>
        <span class="text-gray-400 truncate mt-0.5" :class="compact ? 'text-[9px]' : 'text-[10px]'">
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
      class="font-medium transition-all shrink-0 border-[#2a2d33] bg-[#1e2127]"
      :class="[
        compact ? 'h-6 px-2 text-[10px]' : 'h-8 px-3.5 text-xs',
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

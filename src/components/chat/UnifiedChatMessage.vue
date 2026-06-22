<script setup lang="ts">
import type { UnifiedChatMessage } from "@/composables/useUnifiedChat";

const props = defineProps<{
  message: UnifiedChatMessage;
  channelColor: string;
}>();
</script>

<template>
  <div class="message-row px-3 py-1.5 hover:bg-white/[0.03] transition-colors">
    <div class="flex items-center gap-1.5 mb-0.5">
      <span
        class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        :style="{ backgroundColor: props.channelColor }"
      />
      <span
        class="text-[10px] font-semibold tracking-wider uppercase truncate"
        :style="{ color: props.channelColor }"
      >
        {{ props.message.channel }}
      </span>
    </div>
    <p class="text-sm leading-snug break-words">
      <span class="font-semibold text-gray-200 mr-1">{{ props.message.display_name }}:</span>
      <span class="text-gray-400">{{ props.message.message }}</span>
    </p>
  </div>
</template>

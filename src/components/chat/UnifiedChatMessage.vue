<script setup lang="ts">
import { computed } from "vue";
import type { UnifiedChatMessage } from "@/composables/useUnifiedChat";
import { useEmotes } from "@/composables/useEmotes";
import { Sword, Crown, Gem, Star } from "lucide-vue-next";

const props = defineProps<{
  message: UnifiedChatMessage;
  channelColor: string;
  channelAvatar?: string;
}>();

const { parseMessage } = useEmotes();

const parsedTokens = computed(() => {
  return parseMessage(props.message.message, props.message.emotes, props.message.channel);
});

const parsedBadges = computed(() => {
  const badges = [];
  // Ensure we have an array (just in case the backend sent null or something)
  for (const b of props.message.badges || []) {
    const type = b.split("/")[0];
    if (type === "broadcaster")
      badges.push({
        type,
        icon: Crown,
        color: "text-red-500 fill-red-500/20",
        label: "Broadcaster",
      });
    else if (type === "moderator")
      badges.push({
        type,
        icon: Sword,
        color: "text-green-500 fill-green-500/20",
        label: "Moderator",
      });
    else if (type === "vip")
      badges.push({ type, icon: Gem, color: "text-pink-400 fill-pink-400/20", label: "VIP" });
    else if (type === "subscriber" || type === "founder")
      badges.push({
        type,
        icon: Star,
        color: "text-purple-400 fill-purple-400/20",
        label: "Subscriber",
      });
  }
  return badges;
});

const nameColor = computed(() => props.message.color || "#e5e7eb"); // Default to gray-200
</script>

<template>
  <div class="message-row relative px-3 py-1.5 hover:bg-white/[0.03] transition-colors">
    <!-- Channel Color Left Indicator -->
    <div
      class="absolute left-0 top-0 bottom-0 w-[3px] opacity-70"
      :style="{ backgroundColor: props.channelColor }"
    />

    <div class="flex items-start gap-2 pl-1">
      <!-- Channel Avatar -->
      <img
        v-if="props.channelAvatar"
        :src="props.channelAvatar"
        :alt="props.message.channel"
        :title="`Stream: ${props.message.channel}`"
        class="w-[18px] h-[18px] rounded-full object-cover mt-[1px] shrink-0 border border-white/5"
      />
      <div
        v-else
        class="w-[18px] h-[18px] rounded-full mt-[1px] shrink-0 border border-white/5 flex items-center justify-center text-[8px] font-bold text-white/50 uppercase"
        :style="{ backgroundColor: props.channelColor + '40' }"
        :title="`Stream: ${props.message.channel}`"
      >
        {{ props.message.channel.charAt(0) }}
      </div>

      <!-- Message Content -->
      <p class="text-sm leading-relaxed break-words text-gray-300 flex-1 min-w-0">
        <!-- Badges -->
        <component
          :is="badge.icon"
          v-for="badge in parsedBadges"
          :key="badge.type"
          :class="['inline-block w-4 h-4 mr-1 align-[-0.2em]', badge.color]"
          :title="badge.label"
          stroke-width="2.5"
        />

        <!-- User Name -->
        <span class="font-bold mr-1" :style="{ color: nameColor }">
          {{ props.message.display_name }}<span class="text-gray-400">:</span>
        </span>

        <!-- Tokens -->
        <template v-for="(token, index) in parsedTokens" :key="index">
          <span v-if="token.type === 'text'">{{ token.content }}</span>
          <img
            v-else
            :src="token.content"
            :alt="token.code"
            :title="token.code"
            class="inline-block object-contain mx-0.5 align-middle drop-shadow-sm"
            style="height: 1.5em; max-width: 100%"
          />
        </template>
      </p>
    </div>
  </div>
</template>

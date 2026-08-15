<script setup lang="ts">
import BaseChat from "./BaseChat.vue";
import TwitchNativeChat from "./TwitchNativeChat.vue";
import { PLATFORMS } from "@/config/platforms";
import { useTwitchAuth } from "@/composables/useTwitchAuth";

defineProps<{ channel: string }>();

const { authenticated } = useTwitchAuth();
</script>

<template>
  <TwitchNativeChat v-if="authenticated" :channel="channel" />
  <BaseChat v-else platform="twitch">
    <iframe
      :src="PLATFORMS.twitch.getChatUrl(channel)"
      allowfullscreen
      allow="autoplay; encrypted-media; fullscreen"
      frameborder="0"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    />
  </BaseChat>
</template>

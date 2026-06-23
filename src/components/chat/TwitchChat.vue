<script setup lang="ts">
import { computed } from "vue";
import BaseChat from "./BaseChat.vue";
import TwitchNativeChat from "./TwitchNativeChat.vue";
import { PLATFORMS } from "@/config/platforms";
import { useTwitchAuth } from "@/composables/useTwitchAuth";

defineProps<{ channel: string }>();

const { authenticated } = useTwitchAuth();

const parentHost = computed(() => {
  const hostname = window.location.hostname;
  if (!hostname || hostname.includes("tauri") || hostname === "") {
    return "localhost";
  }
  return hostname;
});
</script>

<template>
  <TwitchNativeChat v-if="authenticated" :channel="channel" />
  <BaseChat v-else platform="twitch">
    <iframe
      :src="`${PLATFORMS.twitch?.chatUrl}/${channel}/chat?parent=${parentHost}&darkpopout=true`"
      allowfullscreen
      allow="autoplay; encrypted-media; fullscreen"
      frameborder="0"
    />
  </BaseChat>
</template>

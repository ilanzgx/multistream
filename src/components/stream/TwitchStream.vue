<script setup lang="ts">
import { computed } from "vue";
import BaseStream from "./BaseStream.vue";
import { PLATFORMS } from "@/config/platforms";

defineProps<{ channel: string; channelid: string }>();

const parentHost = computed(() => {
  const hostname = window.location.hostname;
  if (!hostname || hostname.includes("tauri") || hostname === "") {
    return "localhost";
  }
  return hostname;
});
</script>

<template>
  <BaseStream :channelid="channelid" :channel="channel" platform="twitch">
    <iframe
      :src="`${PLATFORMS.twitch?.embedUrl}/?channel=${channel}&parent=${parentHost}&autoplay=true&muted=true`"
      allowfullscreen
      allow="autoplay; encrypted-media; fullscreen"
      frameborder="0"
    />
  </BaseStream>
</template>

<script setup lang="ts">
import { computed } from "vue";
import BaseStream from "./BaseStream.vue";
import TwitchNativePlayer from "./TwitchNativePlayer.vue";
import { PLATFORMS } from "@/config/platforms";
import { usePreferences } from "@/composables/usePreferences";

defineProps<{ channel: string; channelid: string }>();

const { nativePlayerEnabled } = usePreferences();

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
    <TwitchNativePlayer v-if="nativePlayerEnabled" :key="channel" :channel="channel" />
    <iframe
      v-else
      :src="`${PLATFORMS.twitch?.embedUrl}/?channel=${channel}&parent=${parentHost}&autoplay=true&muted=true`"
      allowfullscreen
      allow="autoplay; encrypted-media; fullscreen"
    />
  </BaseStream>
</template>

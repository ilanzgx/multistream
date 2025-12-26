<script setup lang="ts">
import { computed } from "vue";
import BaseStream from "./BaseStream.vue";

defineProps<{ channel: string; channelid: string }>();

const parentHost = computed(() => window.location.hostname);
</script>

<template>
  <BaseStream :channelid="channelid" :channel="channel" platform="twitch">
    <iframe
      :src="`https://player.twitch.tv/?channel=${channel}&parent=${parentHost}&autoplay=true&muted=true`"
      allowfullscreen
      allow="autoplay; encrypted-media; fullscreen"
      frameborder="0"
    />
  </BaseStream>
</template>

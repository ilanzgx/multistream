<script setup lang="ts">
import { computed } from "vue";
import BaseStream from "./BaseStream.vue";

defineProps<{ channel: string; channelid: string }>();

const parentHost = computed(() => window.location.hostname);
</script>

<template>
  <BaseStream :channelid="channelid">
    <iframe
      :src="`https://player.twitch.tv/?channel=${channel}&parent=${parentHost}`"
      allowfullscreen
      allow="autoplay; encrypted-media; fullscreen"
      frameborder="0"
    />
  </BaseStream>
</template>

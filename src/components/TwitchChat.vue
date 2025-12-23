<script setup lang="ts">
import { computed } from "vue";

defineProps<{ channel: string }>();

const parentHost = computed(() => window.location.hostname);
</script>

<template>
  <iframe
    :src="`https://www.twitch.tv/embed/${channel}/chat?parent=${parentHost}`"
    allowfullscreen
    allow="autoplay; encrypted-media; fullscreen"
    frameborder="0"
  />
</template>

<style scoped>
iframe {
  width: 100%;
  height: 80vh;
}
</style>

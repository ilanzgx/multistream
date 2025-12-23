<script setup lang="ts">
import { computed } from "vue";

// video id
defineProps<{ channel: string }>();

const parentHost = computed(() => window.location.hostname);
</script>

<template>
  <iframe
    width="100%"
    height="100%"
    :src="`https://www.youtube.com/live_chat?v=${channel}&embed_domain=${parentHost}`"
    frameborder="0"
  />
</template>

<style scoped>
iframe {
  width: 100%;
  height: 80vh;
}
</style>

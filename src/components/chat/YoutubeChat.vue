<script setup lang="ts">
import BaseChat from "./BaseChat.vue";
import { PLATFORMS } from "@/config/platforms";

defineProps<{ channel: string }>();
</script>

<template>
  <BaseChat platform="youtube">
    <iframe
      :src="`${PLATFORMS.youtube?.chatUrl}?v=${channel}&embed_domain=localhost&dark_theme=1`"
      frameborder="0"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    />
  </BaseChat>
</template>

<script setup lang="ts">
import BaseChat from "./BaseChat.vue";

defineProps<{ channel: string }>();
</script>

<template>
  <BaseChat>
    <iframe
      :src="`https://www.youtube.com/live_chat?v=${channel}&embed_domain=localhost`"
      frameborder="0"
    />
  </BaseChat>
</template>

<script setup lang="ts">
import { computed } from "vue";
import BaseChat from "./BaseChat.vue";

defineProps<{ channel: string }>();

const parentHost = computed(() => window.location.hostname);
</script>

<template>
  <BaseChat>
    <iframe
      :src="`https://www.youtube.com/live_chat?v=${channel}&embed_domain=${parentHost}`"
      frameborder="0"
    />
  </BaseChat>
</template>

<script setup lang="ts">
import { computed } from "vue";
import BaseChat from "./BaseChat.vue";

defineProps<{ channel: string }>();

const parentHost = computed(() => window.location.hostname);
</script>

<template>
  <BaseChat>
    <iframe
      :src="`https://www.twitch.tv/embed/${channel}/chat?parent=${parentHost}&darkpopout=true`"
      allowfullscreen
      allow="autoplay; encrypted-media; fullscreen"
      frameborder="0"
    />
  </BaseChat>
</template>

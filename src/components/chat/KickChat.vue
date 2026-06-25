<script setup lang="ts">
import KickNativeChat from "./KickNativeChat.vue";

defineProps<{ channel: string }>();
</script>

<template>
  <KickNativeChat :channel="channel" />
</template>

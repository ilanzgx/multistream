<script setup lang="ts">
import BaseChat from "./BaseChat.vue";

defineProps<{ channel: string }>();
</script>

<template>
  <BaseChat>
    <iframe :src="`https://kick.com/${channel}/chatroom`" frameborder="0" />
  </BaseChat>
</template>

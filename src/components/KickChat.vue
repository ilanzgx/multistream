<script setup lang="ts">
defineProps<{ channel: string }>();
</script>

<template>
  <iframe :src="`https://kick.com/${channel}/chatroom`" frameborder="0" />
</template>

<style scoped>
iframe {
  width: 100%;
  height: 80vh;
}
</style>

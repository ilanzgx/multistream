<script setup lang="ts">
defineProps<{ channel: string }>();
</script>

<template>
  <iframe
    :src="`https://player.kick.com/${channel}`"
    allowfullscreen
    frameborder="0"
  />
</template>

<style scoped>
iframe {
  width: 100%;
  height: 100%;
}
</style>

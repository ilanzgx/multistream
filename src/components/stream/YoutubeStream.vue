<script setup lang="ts">
import BaseStream from "./BaseStream.vue";

defineProps<{ channel: string; channelid: string }>();
</script>

<template>
  <BaseStream :channelid="channelid" :channel="channel" platform="youtube">
    <iframe
      :src="`https://www.youtube-nocookie.com/embed/${channel}?autoplay=1&origin=http://localhost`"
      frameborder="0"
      allowfullscreen
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    />
  </BaseStream>
</template>

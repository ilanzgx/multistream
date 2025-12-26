<script setup lang="ts">
import BaseStream from "./BaseStream.vue";

defineProps<{ channel: string; channelid: string }>();
</script>

<template>
  <BaseStream :channelid="channelid" :channel="channel" platform="kick">
    <iframe
      :src="`https://player.kick.com/${channel}`"
      allowfullscreen
      frameborder="0"
    />
  </BaseStream>
</template>

<script setup lang="ts">
import BaseStream from "./BaseStream.vue";

defineProps<{ channel: string; channelid: string; iframeUrl: string }>();
</script>

<template>
  <BaseStream :channelid="channelid" :channel="channel" platform="custom">
    <iframe
      :src="iframeUrl"
      allowfullscreen
      allow="autoplay; encrypted-media; fullscreen"
      frameborder="0"
    />
  </BaseStream>
</template>

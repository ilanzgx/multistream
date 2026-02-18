<script setup lang="ts">
import BaseStream from "./BaseStream.vue";
import { PLATFORMS } from "@/config/platforms";

defineProps<{ channel: string; channelid: string }>();
</script>

<template>
  <BaseStream :channelid="channelid" :channel="channel" platform="youtube">
    <iframe
      :src="`${PLATFORMS.youtube?.embedUrl}/${channel}?autoplay=1&origin=http://localhost`"
      frameborder="0"
      allowfullscreen
      allow="
        accelerometer;
        autoplay;
        clipboard-write;
        encrypted-media;
        gyroscope;
        picture-in-picture;
      "
    />
  </BaseStream>
</template>

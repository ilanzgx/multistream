<script setup lang="ts">
import BaseStream from "./BaseStream.vue";
import { PLATFORMS } from "@/config/platforms";

defineProps<{ channel: string; channelid: string }>();
</script>

<template>
  <BaseStream :channelid="channelid" :channel="channel" platform="youtube">
    <iframe
      :title="`YouTube Stream: ${channel}`"
      :src="PLATFORMS.youtube.getEmbedUrl(channel)"
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

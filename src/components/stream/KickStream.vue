<script setup lang="ts">
import BaseStream from "./BaseStream.vue";
import { PLATFORMS } from "@/config/platforms";

defineProps<{ channel: string; channelid: string }>();
</script>

<template>
  <BaseStream :channelid="channelid" :channel="channel" platform="kick">
    <iframe
      :src="`${PLATFORMS.kick?.embedUrl}/${channel}`"
      allowfullscreen
      frameborder="0"
    />
  </BaseStream>
</template>

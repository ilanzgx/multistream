<script setup lang="ts">
import BaseStream from "./BaseStream.vue";
import { PLATFORMS } from "@/config/platforms";
// import { useStreams } from "@/composables/useStreams";

defineProps<{ channel: string; channelid: string }>();

// const { isLeaving } = useStreams();
</script>

<template>
  <BaseStream :channelid="channelid" :channel="channel" platform="kick">
    <iframe :src="`${PLATFORMS.kick?.embedUrl}/${channel}`" allowfullscreen />
  </BaseStream>
</template>

<script setup lang="ts">
import { computed } from "vue";
import BaseStream from "./BaseStream.vue";

const props = defineProps<{
  channel: string;
  channelid: string;
  iframeUrl: string;
}>();

const safeUrl = computed(() => {
  if (!props.iframeUrl) return "";
  if (
    !props.iframeUrl.startsWith("http://") &&
    !props.iframeUrl.startsWith("https://")
  ) {
    return `https://${props.iframeUrl}`;
  }
  return props.iframeUrl;
});
</script>

<template>
  <BaseStream :channelid="channelid" :channel="channel" platform="custom">
    <iframe
      :src="safeUrl"
      allowfullscreen
      allow="autoplay; encrypted-media; fullscreen"
      frameborder="0"
    />
  </BaseStream>
</template>

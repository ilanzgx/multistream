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
  let url = props.iframeUrl;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  // reject non-HTTP(S) protocols
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }
  } catch {
    return "";
  }
  return url;
});
</script>

<template>
  <BaseStream :channelid="channelid" :channel="channel" platform="custom">
    <iframe
      :src="safeUrl"
      allowfullscreen
      allow="autoplay; encrypted-media; fullscreen"
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox allow-forms"
    />
  </BaseStream>
</template>

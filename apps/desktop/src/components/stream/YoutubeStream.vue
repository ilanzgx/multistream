<script setup lang="ts">
import { computed } from "vue";
import BaseStream from "./BaseStream.vue";
import { PLATFORMS } from "@/config/platforms";
import { usePreferences } from "@/composables/usePreferences";

const props = defineProps<{ channel: string; channelid: string }>();

const { adblockEnabled } = usePreferences();

const embedUrl = computed(() => {
  const base = PLATFORMS.youtube.getEmbedUrl(props.channel);
  return `${base}#ms-adblock=${adblockEnabled.value ? "1" : "0"}`;
});
</script>

<template>
  <BaseStream :channelid="channelid" :channel="channel" platform="youtube">
    <iframe
      :key="`${channel}-${adblockEnabled}`"
      :name="`multistream-player-${adblockEnabled ? 'adblock' : 'vanilla'}`"
      :title="`YouTube Stream: ${channel}`"
      :src="embedUrl"
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

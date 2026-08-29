<script setup lang="ts">
import { computed } from "vue";
import BaseStream from "./BaseStream.vue";
import TwitchNativePlayer from "./TwitchNativePlayer.vue";
import { PLATFORMS } from "@/config/platforms";
import { usePreferences } from "@/composables/usePreferences";
import { useLiveStatus } from "@/composables/useLiveStatus";
import { useProfilePicture } from "@/composables/useProfilePicture";
import { useFocusedStream } from "@/composables/useFocusedStream";

const props = defineProps<{ channel: string; channelid: string }>();

const { nativePlayerEnabled } = usePreferences();
const { getStatus } = useLiveStatus();
const { getProfilePicture } = useProfilePicture();
const { isFocused } = useFocusedStream();

const liveStatus = computed(() => getStatus(props.channel, "twitch"));
const profilePicture = getProfilePicture(props.channel, "twitch");
const isStreamFocused = computed(() => isFocused(props.channelid));
</script>

<template>
  <BaseStream :channelid="channelid" :channel="channel" platform="twitch">
    <TwitchNativePlayer
      v-if="nativePlayerEnabled"
      :key="channel"
      :channel="channel"
      :title="liveStatus?.title"
      :viewer-count="liveStatus?.viewerCount"
      :avatar-url="profilePicture"
      :is-focused="isStreamFocused"
    />
    <iframe
      v-else
      :title="`Twitch Stream: ${channel}`"
      :src="PLATFORMS.twitch.getEmbedUrl(channel)"
      allowfullscreen
      allow="autoplay; encrypted-media; fullscreen"
    />
  </BaseStream>
</template>

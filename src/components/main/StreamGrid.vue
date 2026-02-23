<script lang="ts" setup>
import KickStream from "@/components/stream/KickStream.vue";
import TwitchStream from "@/components/stream/TwitchStream.vue";
import YoutubeStream from "@/components/stream/YoutubeStream.vue";
import CustomStream from "@/components/stream/CustomStream.vue";
import { useStreams } from "@/composables/useStreams";

const { streams, gridClass } = useStreams();
</script>

<template>
  <div class="h-full grid" :class="gridClass">
    <template v-for="(stream, index) in streams" :key="stream.id">
      <KickStream
        v-if="stream.platform === 'kick'"
        :channel="stream.channel"
        :channelid="stream.id"
        :class="{
          'col-span-2 justify-self-center w-1/2':
            streams.length === 3 && index === 2,
        }"
      />
      <TwitchStream
        v-else-if="stream.platform === 'twitch'"
        :channel="stream.channel"
        :channelid="stream.id"
        :class="{
          'col-span-2 justify-self-center w-1/2':
            streams.length === 3 && index === 2,
        }"
      />
      <YoutubeStream
        v-else-if="stream.platform === 'youtube'"
        :channel="stream.channel"
        :channelid="stream.id"
        :class="{
          'col-span-2 justify-self-center w-1/2':
            streams.length === 3 && index === 2,
        }"
      />
      <CustomStream
        v-else-if="stream.platform === 'custom'"
        :channel="stream.channel"
        :channelid="stream.id"
        :iframeUrl="stream.iframeUrl || ''"
        :class="{
          'col-span-2 justify-self-center w-1/2':
            streams.length === 3 && index === 2,
        }"
      />
    </template>
  </div>
</template>

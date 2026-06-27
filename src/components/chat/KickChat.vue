<script setup lang="ts">
import KickNativeChat from "./KickNativeChat.vue";

import { isTauri } from "@/composables/useUpdater";
import { PLATFORMS } from "@/config/platforms";

defineProps<{ channel: string }>();
</script>

<template>
  <KickNativeChat v-if="isTauri()" :channel="channel" />
  <BaseChat v-else platform="kick">
    <iframe
      class="w-full h-full flex-1 border-none"
      :src="`${PLATFORMS.kick?.chatUrl}/${channel}?readonly=true`"
      frameborder="0"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    />
  </BaseChat>
</template>

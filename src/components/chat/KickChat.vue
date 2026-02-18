<script setup lang="ts">
import BaseChat from "./BaseChat.vue";
import { PLATFORMS } from "@/config/platforms";

defineProps<{ channel: string }>();
</script>

<template>
  <BaseChat>
    <iframe
      :src="`${PLATFORMS.kick?.chatUrl}/${channel}/chatroom`"
      frameborder="0"
    />
  </BaseChat>
</template>

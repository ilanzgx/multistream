<script setup lang="ts">
import BaseChat from "./BaseChat.vue";
import { PLATFORMS } from "@/config/platforms";

defineProps<{ channel: string }>();
</script>

<template>
  <BaseChat platform="kick">
    <iframe :src="`${PLATFORMS.kick?.chatUrl}/${channel}?readonly=true`" frameborder="0" />
  </BaseChat>
</template>

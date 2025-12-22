<script setup lang="ts">
import { useStreams } from "@/composables/useStreams";
import { X } from "lucide-vue-next";
import { ref } from "vue";

const { removeStream } = useStreams();

defineProps<{ channel: string; channelid: string }>();

const buttonVisible = ref(false);
</script>

<template>
  <div
    class="relative"
    @mouseover="buttonVisible = true"
    @mouseleave="buttonVisible = false"
  >
    <button
      v-if="buttonVisible"
      @click="removeStream(channelid)"
      class="absolute top-1 right-1 cursor-pointer z-10"
    >
      <X class="bg-red-400 text-white p-1 rounded-full" />
    </button>
    <iframe
      :src="`https://player.kick.com/${channel}`"
      allowfullscreen
      frameborder="0"
    />
  </div>
</template>

<style scoped>
iframe {
  width: 100%;
  height: 100%;
}
</style>

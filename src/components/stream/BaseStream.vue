<script setup lang="ts">
import { useStreams } from "@/composables/useStreams";
import { X, Heart } from "lucide-vue-next";
import { ref } from "vue";

const { removeStream } = useStreams();

defineProps<{ channelid: string }>();

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
      class="absolute top-1 right-1 cursor-pointer z-10 hover:opacity-75"
    >
      <X class="bg-red-400 text-white p-1 rounded-full size-8" />
    </button>
    <button
      v-if="buttonVisible"
      class="absolute top-11 right-1 cursor-pointer z-10 hover:opacity-75"
    >
      <Heart class="bg-sky-400 text-white p-1 rounded-full size-8" />
    </button>

    <slot />
  </div>
</template>

<style scoped>
:slotted(iframe) {
  width: 100%;
  height: 100%;
}
</style>

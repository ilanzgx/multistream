<script setup lang="ts">
import { useStreams } from "@/composables/useStreams";
import { X, Heart, Loader2 } from "lucide-vue-next";
import { ref, onMounted, nextTick } from "vue";

const { removeStream } = useStreams();

defineProps<{ channelid: string }>();

const buttonVisible = ref(false);
const isLoading = ref(true);
const containerRef = ref<HTMLElement>();

onMounted(() => {
  nextTick(() => {
    const iframe = containerRef.value?.querySelector("iframe");
    if (iframe) {
      iframe.addEventListener("load", () => {
        setTimeout(() => {
          isLoading.value = false;
        }, 2000);
      });
    }
  });
});
</script>

<template>
  <div
    ref="containerRef"
    class="relative h-full"
    @mouseover="buttonVisible = true"
    @mouseleave="buttonVisible = false"
  >
    <!-- enhanced skeleton loader -->
    <div
      v-if="isLoading"
      class="absolute inset-0 w-full h-full bg-linear-to-br from-[#2a2d33] via-[#23262c] to-[#2a2d33] flex flex-col items-center justify-center gap-4 z-50"
    >
      <div class="relative">
        <!-- spinner -->
        <Loader2 class="w-16 h-16 text-gray-600 animate-spin drop-shadow-lg" />
      </div>

      <div class="text-center space-y-2">
        <p class="text-lg font-semibold text-white drop-shadow-md">
          Loading stream...
        </p>
        <div class="flex gap-1 justify-center">
          <div
            class="w-2 h-2 bg-gray-700 rounded-full animate-bounce drop-shadow-lg"
            style="animation-delay: 0ms"
          ></div>
          <div
            class="w-2 h-2 bg-gray-700 rounded-full animate-bounce drop-shadow-lg"
            style="animation-delay: 150ms"
          ></div>
          <div
            class="w-2 h-2 bg-gray-700 rounded-full animate-bounce drop-shadow-lg"
            style="animation-delay: 300ms"
          ></div>
        </div>
      </div>

      <!-- shimmer effect -->
      <div class="absolute inset-0 opacity-20">
        <div
          class="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent animate-shimmer"
        ></div>
      </div>
    </div>

    <button
      v-if="buttonVisible"
      @click="removeStream(channelid)"
      class="absolute top-10 right-1 cursor-pointer z-10 hover:opacity-75"
    >
      <X class="bg-red-400 text-white p-1 rounded-full size-6" />
    </button>
    <button
      v-if="buttonVisible"
      class="absolute top-17 right-1 cursor-pointer z-10 hover:opacity-75"
    >
      <Heart class="bg-sky-400 text-white p-1 rounded-full size-6" />
    </button>

    <slot />
  </div>
</template>

<style scoped>
:slotted(iframe) {
  width: 100%;
  height: 100%;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.animate-shimmer {
  animation: shimmer 2s infinite;
}
</style>

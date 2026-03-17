<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from "vue";
import { Skeleton } from "@/components/ui/skeleton";
import { PLATFORMS } from "@/config/platforms";
import type { Platform } from "@/composables/useStreams";

const props = defineProps<{ platform?: Platform }>();

const platformConfig = computed(() =>
  props.platform ? PLATFORMS[props.platform] : null,
);

const isLoading = ref(true);
const containerRef = ref<HTMLElement>();

onMounted(() => {
  nextTick(() => {
    const iframe = containerRef.value?.querySelector("iframe");
    if (iframe) {
      iframe.addEventListener("load", () => {
        setTimeout(() => {
          isLoading.value = false;
        }, 1500);
      });
    } else {
      isLoading.value = false;
    }
  });
});
</script>

<template>
  <div ref="containerRef" class="chat-container">
    <Transition name="fade">
      <div
        v-if="isLoading"
        class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#0f1115] p-6"
      >
        <!-- Platform icon -->
        <component
          v-if="platformConfig?.icon"
          :is="platformConfig.icon"
          :size="48"
          :style="{ color: platformConfig.color }"
          class="opacity-30"
        />

        <!-- Simple skeleton lines hinting at chat -->
        <div class="flex flex-col gap-2 w-full">
          <Skeleton class="h-2.5 w-3/4 mx-auto bg-white/5 rounded" />
          <Skeleton class="h-2.5 w-1/2 mx-auto bg-white/5 rounded" />
          <Skeleton class="h-2.5 w-2/3 mx-auto bg-white/5 rounded" />
        </div>
      </div>
    </Transition>

    <slot />
  </div>
</template>

<style scoped>
.chat-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

:slotted(iframe) {
  width: 100%;
  height: 100%;
  flex: 1;
  min-height: 0;
  border: none;
}

.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-leave-to {
  opacity: 0;
}
</style>

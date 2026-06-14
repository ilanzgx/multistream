<script setup lang="ts">
import { useTranscription } from "@/composables/useTranscription";

const { isActive, lines } = useTranscription();
</script>

<template>
  <div
    v-if="isActive && lines.length > 0"
    class="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-[80%] flex flex-col items-center gap-1 z-50 pointer-events-none"
  >
    <TransitionGroup name="transcription-line">
      <p
        v-for="(line, index) in lines"
        :key="line.timestamp"
        class="bg-black/75 text-white text-sm px-3 py-1 rounded text-center backdrop-blur-sm transition-opacity duration-300 w-fit max-w-full truncate"
        :class="[
          index === lines.length - 1
            ? 'opacity-100'
            : index === lines.length - 2
              ? 'opacity-60'
              : 'opacity-30',
        ]"
      >
        {{ line.text }}
      </p>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.transcription-line-enter-active,
.transcription-line-leave-active {
  transition: all 0.3s ease;
}
.transcription-line-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.transcription-line-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>

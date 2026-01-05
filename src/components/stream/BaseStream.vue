<script setup lang="ts">
import { useStreams } from "@/composables/useStreams";
import { X, Heart } from "lucide-vue-next";
import { ref, onMounted, nextTick, computed } from "vue";

import YoutubeIcon from "@/components/icons/YoutubeIcon.vue";
import KickIcon from "@/components/icons/KickIcon.vue";
import TwitchIcon from "@/components/icons/TwitchIcon.vue";

import { useI18n } from "vue-i18n";

const { removeStream } = useStreams();
const { t } = useI18n();

const props = defineProps<{
  channelid: string;
  channel: string;
  platform: "twitch" | "kick" | "youtube";
}>();

const platformConfig = computed(() => {
  const configs = {
    twitch: {
      icon: TwitchIcon,
      color: "#9146FF",
      name: "Twitch",
    },
    kick: {
      icon: KickIcon,
      color: "#53FC18",
      name: "Kick",
    },
    youtube: {
      icon: YoutubeIcon,
      color: "#FF0000",
      name: "YouTube",
    },
  };
  return configs[props.platform];
});

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
      class="absolute inset-0 w-full h-full bg-linear-to-br from-[#1a1c20] via-[#0f1012] to-[#1a1c20] flex flex-col items-center justify-center gap-6 z-50"
    >
      <div class="relative">
        <div
          class="absolute inset-0 rounded-full blur-xl opacity-20 animate-pulse"
          :style="{ backgroundColor: platformConfig.color }"
        ></div>

        <div
          class="relative w-24 h-24 rounded-full flex items-center justify-center border-2 animate-pulse"
          :style="{
            borderColor: platformConfig.color,
            boxShadow: `0 0 30px ${platformConfig.color}40, inset 0 0 20px ${platformConfig.color}20`,
          }"
        >
          <component
            :is="platformConfig.icon"
            :size="48"
            class="drop-shadow-lg"
            :style="{ color: platformConfig.color }"
          />
        </div>
      </div>

      <!-- loading text -->
      <div class="text-center space-y-2">
        <p class="text-xl font-bold text-white/90 tracking-wide">
          {{ channel }}
        </p>
        <div class="flex flex-col items-center gap-2">
          <p class="text-sm text-gray-400">{{ t("skeleton.loading") }}</p>
          <div class="flex gap-1.5">
            <div
              class="w-1.5 h-1.5 rounded-full animate-bounce"
              :style="{
                backgroundColor: platformConfig.color,
                animationDelay: '0ms',
              }"
            ></div>
            <div
              class="w-1.5 h-1.5 rounded-full animate-bounce"
              :style="{
                backgroundColor: platformConfig.color,
                animationDelay: '150ms',
              }"
            ></div>
            <div
              class="w-1.5 h-1.5 rounded-full animate-bounce"
              :style="{
                backgroundColor: platformConfig.color,
                animationDelay: '300ms',
              }"
            ></div>
          </div>
        </div>
      </div>

      <!-- shimmer effect -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          class="absolute inset-0 bg-linear-to-r from-transparent via-white/5 to-transparent animate-shimmer"
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

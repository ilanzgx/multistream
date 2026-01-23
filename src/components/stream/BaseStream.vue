<script setup lang="ts">
import { useStreams } from "@/composables/useStreams";
import { X, Heart } from "lucide-vue-next";
import { ref, onMounted, nextTick, computed } from "vue";

import YoutubeIcon from "@/components/icons/YoutubeIcon.vue";
import KickIcon from "@/components/icons/KickIcon.vue";
import TwitchIcon from "@/components/icons/TwitchIcon.vue";
import CustomIcon from "@/components/icons/CustomIcon.vue";

import { useI18n } from "vue-i18n";
import { Skeleton } from "@/components/ui/skeleton";

const { removeStream } = useStreams();
useI18n();

const props = defineProps<{
  channelid: string;
  channel: string;
  platform: "twitch" | "kick" | "youtube" | "custom";
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
    custom: {
      icon: CustomIcon,
      color: "#6366F1",
      name: "Custom",
    },
  };
  return configs[props.platform];
});

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
  <div ref="containerRef" class="relative h-full group">
    <!-- clean shadcn skeleton loader -->
    <div
      v-if="isLoading"
      class="absolute inset-0 w-full h-full bg-[#0f1115] flex flex-col items-center justify-center z-50"
    >
      <div class="w-full h-full p-8 flex flex-col gap-4">
        <!-- video area skeleton -->
        <Skeleton class="flex-1 w-full rounded-xl bg-white/5" />

        <!-- info area skeleton -->
        <div class="flex items-center gap-3">
          <Skeleton class="h-12 w-12 rounded-full bg-white/5" />
          <div class="space-y-2">
            <Skeleton class="h-4 w-32 bg-white/5" />
            <Skeleton class="h-3 w-24 bg-white/5" />
          </div>
        </div>
      </div>

      <!-- centered platform icon (subtle) -->
      <div
        class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10"
      >
        <component
          :is="platformConfig.icon"
          :size="80"
          :style="{ color: platformConfig.color }"
        />
      </div>
    </div>

    <!-- stream controls - appears on hover -->
    <div
      class="absolute top-2 right-2 z-10 flex flex-col gap-2 opacity-0 translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0"
    >
      <button
        @click="removeStream(channelid)"
        class="flex items-center justify-center size-8 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-white/80 hover:bg-red-500/80 hover:text-white hover:border-red-400/50 transition-all duration-200 hover:scale-110 cursor-pointer"
        title="Remover stream"
      >
        <X class="size-4" />
      </button>
      <button
        class="flex items-center justify-center size-8 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-white/80 hover:bg-pink-500/80 hover:text-white hover:border-pink-400/50 transition-all duration-200 hover:scale-110 cursor-pointer"
        title="Favoritar"
      >
        <Heart class="size-4" />
      </button>
    </div>

    <slot />
  </div>
</template>

<style scoped>
:slotted(iframe) {
  width: 100%;
  height: 100%;
}
</style>

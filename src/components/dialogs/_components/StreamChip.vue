<script setup lang="ts">
import { computed } from "vue";
import { X } from "lucide-vue-next";
import { PLATFORMS } from "@/config/platforms";
import type { Platform } from "@/composables/useStreams";
import { useLiveStatus } from "@/composables/useLiveStatus";

const props = defineProps<{
  channel: string;
  platform: Platform;
}>();

const emit = defineEmits<{
  (e: "click"): void;
  (e: "remove"): void;
}>();

const { getStatus } = useLiveStatus();
const status = computed(() => getStatus(props.channel, props.platform));

const formatViewers = (count?: number): string => {
  if (!count) return "";
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
};
</script>

<template>
  <button
    type="button"
    class="group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer"
    :class="[
      status?.isLive
        ? 'bg-[#1a1d21] text-white hover:bg-[#2a2d33]'
        : 'text-gray-400 hover:text-white hover:bg-[#1a1d21]',
    ]"
    :title="
      status?.isLive
        ? `🔴 LIVE — ${status?.viewerCount?.toLocaleString() ?? '?'} viewers${status?.category ? ` • ${status?.category}` : ''}`
        : undefined
    "
    @click="emit('click')"
  >
    <!-- live indicator dot -->
    <span v-if="status?.isLive" class="relative flex h-2 w-2 shrink-0">
      <span
        class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"
      />
      <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
    </span>
    <span
      v-else-if="props.platform === 'twitch' || props.platform === 'kick'"
      class="h-2 w-2 shrink-0 rounded-full bg-gray-600"
    />

    <component
      :is="PLATFORMS[props.platform]?.icon"
      :size="14"
      :style="{ color: PLATFORMS[props.platform]?.color }"
    />
    <span class="truncate max-w-30">{{ props.channel }}</span>

    <!-- viewer count badge -->
    <span
      v-if="status?.isLive"
      class="text-[10px] text-green-300 font-medium tabular-nums ml-0.5"
    >
      {{ formatViewers(status?.viewerCount) }}
    </span>

    <span
      class="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-[#2a2d33] border border-[#3a3f4b] transition-colors hover:bg-red-500/80 hover:border-red-400"
      @click.stop="emit('remove')"
    >
      <X :size="8" class="text-white" />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { X } from "@lucide/vue";
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
const { locale } = useI18n();
const status = computed(() => getStatus(props.channel, props.platform));

const formatViewers = (count?: number): string => {
  if (count === undefined || count === null) return "";
  return new Intl.NumberFormat(locale.value, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
};
</script>

<template>
  <div
    role="group"
    tabindex="0"
    class="group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer border hover:-translate-y-px active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
    :class="[
      status?.isLive
        ? 'bg-[#1a1d21] text-white border-transparent hover:bg-[#2a2d33]'
        : 'text-gray-400 hover:text-white hover:bg-[#1a1d21] border-[#2a2d33] bg-[#14161a] hover:border-[#3a3f4b]',
    ]"
    :title="
      status?.isLive
        ? `🔴 ${$t('nativePlayer.live')} — ${$t('stream.viewers', { count: status?.viewerCount !== undefined ? formatViewers(status.viewerCount) : '?' })}${status?.category ? ` • ${status?.category}` : ''}`
        : undefined
    "
    @click="emit('click')"
    @keydown.enter.space.prevent="emit('click')"
  >
    <!-- live indicator dot -->
    <span v-if="status?.isLive" class="h-2 w-2 shrink-0 rounded-full bg-red-500" />
    <span
      v-else-if="props.platform === 'twitch' || props.platform === 'kick'"
      class="h-2 w-2 shrink-0 rounded-full bg-gray-600"
    />

    <component
      :is="PLATFORMS[props.platform]?.icon"
      :size="14"
      :class="[
        !status?.isLive
          ? 'opacity-50 saturate-50 group-hover:opacity-100 group-hover:saturate-100 transition-all duration-200'
          : '',
      ]"
      :style="{ color: PLATFORMS[props.platform]?.color }"
    />
    <span class="truncate max-w-30">{{ props.channel }}</span>

    <!-- viewer count badge -->
    <span v-if="status?.isLive" class="text-[10px] text-green-300 font-medium tabular-nums ml-0.5">
      {{ formatViewers(status?.viewerCount) }}
    </span>

    <button
      type="button"
      :aria-label="$t('add.removeStream')"
      class="absolute -top-1 -right-1 hidden group-hover:flex focus-visible:flex items-center justify-center w-4 h-4 rounded-full bg-[#2a2d33] border border-[#3a3f4b] transition-colors hover:bg-red-500/80 hover:border-red-400 cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-400"
      @click.stop="emit('remove')"
    >
      <X :size="8" class="text-white" />
    </button>
  </div>
</template>

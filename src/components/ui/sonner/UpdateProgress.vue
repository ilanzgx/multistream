<script setup lang="ts">
import { computed } from "vue";
import { Loader2 } from "@lucide/vue";

const props = defineProps<{
  downloaded: number;
  total: number;
}>();

const downloadedMB = computed(() => (props.downloaded / 1024 / 1024).toFixed(1));
const totalMB = computed(() => (props.total > 0 ? (props.total / 1024 / 1024).toFixed(1) : "..."));
const percent = computed(() =>
  props.total > 0 ? Math.round((props.downloaded / props.total) * 100) : 0
);
</script>

<template>
  <div
    class="w-89 bg-[#14161a] border border-[#2a2d33] rounded-xl! px-4 py-3.5 shadow-lg shadow-black/50 flex flex-col space-y-3"
  >
    <div class="flex items-center gap-3">
      <Loader2 class="size-4 animate-spin text-white shrink-0" />
      <span class="text-[14px] font-semibold text-white tracking-wide">
        {{ $t("toasts.update.downloading") }}
      </span>
    </div>

    <div class="w-full space-y-1.5">
      <div class="flex justify-between text-[11px] text-gray-400 font-mono">
        <span>{{ downloadedMB }} MB / {{ totalMB }} MB</span>
        <span v-if="props.total > 0" class="text-white">{{ percent }}%</span>
      </div>
      <div
        class="h-1.5 w-full bg-[#0f1115] rounded-full overflow-hidden border border-[#2a2d33]/50"
      >
        <div
          class="h-full bg-white transition-all duration-300"
          :style="{ width: percent + '%' }"
        ></div>
      </div>
    </div>
  </div>
</template>

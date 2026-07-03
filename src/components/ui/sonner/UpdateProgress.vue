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
    class="w-89 bg-[#0f1115] border border-[#2a2d33] rounded-xl p-4 flex flex-col items-center justify-center space-y-3 shadow-xl"
  >
    <div class="flex items-center gap-2 text-sm font-medium text-white">
      <Loader2 class="size-4 animate-spin text-gray-400 shrink-0" />
      <span>{{ $t("toasts.update.downloading") }}</span>
    </div>

    <div class="w-65 space-y-1.5">
      <div class="flex justify-between text-[11px] text-gray-400 font-mono">
        <span>{{ downloadedMB }} MB / {{ totalMB }} MB</span>
        <span v-if="props.total > 0" class="text-blue-400">{{ percent }}%</span>
      </div>
      <div class="h-1.5 w-full bg-[#14161a] rounded-full overflow-hidden border border-[#2a2d33]">
        <div
          class="h-full bg-blue-500 transition-all duration-300"
          :style="{ width: percent + '%' }"
        ></div>
      </div>
    </div>
  </div>
</template>

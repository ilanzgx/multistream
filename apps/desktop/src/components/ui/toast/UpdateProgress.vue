<script setup lang="ts">
import { computed } from "vue";
import { Loader2 } from "@lucide/vue";
import BaseCustomToast from "./BaseCustomToast.vue";

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
  <BaseCustomToast
    :title="$t('toasts.update.downloading')"
    :icon="Loader2"
    icon-class="animate-spin text-white"
  >
    <div class="space-y-1.5">
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
  </BaseCustomToast>
</template>

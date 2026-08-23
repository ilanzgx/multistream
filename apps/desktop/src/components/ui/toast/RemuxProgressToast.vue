<script setup lang="ts">
import { computed } from "vue";
import { Loader2 } from "@lucide/vue";
import BaseCustomToast from "./BaseCustomToast.vue";
import { remuxProgressMap } from "@/composables/useRecording";

const props = defineProps<{
  streamId: string;
  channel?: string;
}>();

const progress = computed(
  () => remuxProgressMap.get(props.streamId) || { bytes: 0, totalBytes: 0 }
);

const downloadedMB = computed(() => (progress.value.bytes / 1024 / 1024).toFixed(1));
const totalMB = computed(() =>
  progress.value.totalBytes > 0 ? (progress.value.totalBytes / 1024 / 1024).toFixed(1) : "..."
);
const percent = computed(() =>
  progress.value.totalBytes > 0
    ? Math.round((progress.value.bytes / progress.value.totalBytes) * 100)
    : 0
);
</script>

<template>
  <BaseCustomToast
    :title="$t('settings.recording.remuxing')"
    :icon="Loader2"
    icon-class="animate-spin text-white"
  >
    <div class="space-y-1.5">
      <div v-if="props.channel" class="text-xs text-gray-400 font-medium truncate pb-1">
        {{ props.channel }}
      </div>
      <div class="flex justify-between text-[11px] text-gray-400 font-mono">
        <span>{{ downloadedMB }} MB / {{ totalMB }} MB</span>
        <span v-if="progress.totalBytes > 0" class="text-white">{{ percent }}%</span>
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

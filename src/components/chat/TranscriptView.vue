<script lang="ts" setup>
import { ref, watch, nextTick } from "vue";
import { useTranscription } from "@/composables/useTranscription";
import { Button } from "@/components/ui/button";
import { Copy, Trash2 } from "lucide-vue-next";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";

const { transcriptHistory, clearTranscriptHistory } = useTranscription();
const { t } = useI18n();
const scrollContainer = ref<HTMLElement | null>(null);

// Auto-scroll to bottom when new entries are added
watch(
  () => transcriptHistory.value.length,
  async () => {
    await nextTick();
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
    }
  }
);

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

async function copyTranscript() {
  if (transcriptHistory.value.length === 0) return;

  const text = transcriptHistory.value
    .map((entry) => `[${formatTime(entry.timestamp)}] ${entry.text}`)
    .join("\n");

  try {
    await navigator.clipboard.writeText(text);
    toast.success(t("chat.transcript.copied"));
  } catch (err) {
    console.error("Failed to copy transcript", err);
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-[#0f1115]">
    <!-- Toolbar -->
    <div class="flex items-center justify-end gap-2 p-2 border-b border-[#1f2227] bg-[#14161a]">
      <Button
        variant="outline"
        size="sm"
        class="h-7 text-xs border-[#2a2d33] bg-[#1a1d24] hover:bg-[#2a2d33] hover:text-white text-gray-400 transition-colors"
        :disabled="transcriptHistory.length === 0"
        @click="copyTranscript"
      >
        <Copy class="w-3.5 h-3.5 mr-1.5" />
        {{ $t("chat.transcript.copy") }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="h-7 text-xs border-[#2a2d33] bg-[#1a1d24] hover:bg-[#2a2d33] hover:text-white text-gray-400 transition-colors"
        :disabled="transcriptHistory.length === 0"
        @click="clearTranscriptHistory"
      >
        <Trash2 class="w-3.5 h-3.5 mr-1.5" />
        {{ $t("chat.transcript.clear") }}
      </Button>
    </div>

    <!-- Transcript Area -->
    <div ref="scrollContainer" class="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
      <div
        v-if="transcriptHistory.length === 0"
        class="h-full flex items-center justify-center text-muted-foreground"
      >
        <p class="text-center text-sm text-gray-400">
          {{ $t("chat.transcript.emptyState") }}<br />
          <span class="text-xs text-gray-500 mt-1 inline-block">{{
            $t("chat.transcript.emptyStateHint")
          }}</span>
        </p>
      </div>

      <div v-for="(entry, index) in transcriptHistory" :key="index" class="flex flex-col gap-0.5">
        <span class="text-[10px] text-gray-500 font-mono">{{ formatTime(entry.timestamp) }}</span>
        <p class="text-sm text-gray-200 leading-relaxed">{{ entry.text }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #2a2d33;
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #3a3f4b;
}
</style>

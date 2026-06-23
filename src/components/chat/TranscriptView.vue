<script lang="ts" setup>
import { ref, watch, nextTick, computed } from "vue";
import { useNow } from "@vueuse/core";
import { useTranscription } from "@/composables/useTranscription";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Copy, Trash2 } from "lucide-vue-next";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const {
  transcriptHistory,
  clearTranscriptHistory,
  selectedModel,
  captionMode,
  lastCaptionTime,
  showOverlay,
} = useTranscription();
const { t } = useI18n();
const now = useNow();
const scrollContainer = ref<HTMLElement | null>(null);

const timeAgoText = computed(() => {
  if (!lastCaptionTime.value) return null;
  const diffInSeconds = Math.floor((now.value.getTime() - lastCaptionTime.value) / 1000);
  if (diffInSeconds < 5) return t("settings.transcription.timeNow");
  if (diffInSeconds < 60) {
    const timeStr = t("settings.transcription.timeS", { s: diffInSeconds });
    return t("settings.transcription.timeAgo", { time: timeStr });
  }
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const timeStr = t("settings.transcription.timeM", { m: diffInMinutes });
  return t("settings.transcription.timeAgo", { time: timeStr });
});

const captionModeTranslationKey = computed(() => {
  return captionMode.value === "translate"
    ? "settings.transcription.captionModeTranslate"
    : "settings.transcription.captionModeOriginal";
});

const formattedModelName = computed(() => {
  if (!selectedModel.value) return "";
  return selectedModel.value.charAt(0).toUpperCase() + selectedModel.value.slice(1);
});

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
    <div class="flex items-center justify-between gap-2 p-2 border-b border-[#1f2227] bg-[#14161a]">
      <!-- Status Block -->
      <div class="flex flex-col gap-0.5 min-w-0">
        <span class="text-[10px] text-gray-400 truncate leading-tight">
          {{ $t("settings.transcription.modelLabel") }}:
          <span class="text-gray-300">{{ formattedModelName }}</span>
        </span>
        <span class="text-[10px] text-gray-400 truncate leading-tight">
          {{ $t("settings.transcription.modeLabel") }}:
          <span class="text-gray-300">{{ $t(captionModeTranslationKey) }}</span>
        </span>
        <span v-if="timeAgoText" class="text-[10px] text-gray-400 truncate leading-tight">
          {{ $t("settings.transcription.lastCaption") }}
          <span class="text-gray-300">{{ timeAgoText }}</span>
        </span>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2 shrink-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <div class="flex items-center mr-1">
                <Switch v-model="showOverlay" data-testid="transcription-overlay-toggle" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ $t("chat.transcript.showOverlay") }}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                size="icon"
                class="h-6 w-6 border-[#2a2d33] bg-[#1a1d24] hover:bg-[#2a2d33] hover:text-white text-gray-400 transition-colors"
                :disabled="transcriptHistory.length === 0"
                @click="copyTranscript"
              >
                <Copy class="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ $t("chat.transcript.copy") }}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                size="icon"
                class="h-6 w-6 border-[#2a2d33] bg-[#1a1d24] hover:bg-[#2a2d33] hover:text-white text-gray-400 transition-colors"
                :disabled="transcriptHistory.length === 0"
                @click="clearTranscriptHistory"
              >
                <Trash2 class="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ $t("chat.transcript.clear") }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>

    <!-- Transcript Area -->
    <div ref="scrollContainer" class="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
      <div
        v-if="transcriptHistory.length === 0"
        class="h-full flex items-center justify-center text-muted-foreground"
      >
        <p class="text-center text-sm text-gray-400">
          {{ $t("chat.transcript.emptyState") }}<br />
          <span class="text-xs text-gray-400 mt-1 inline-block">{{
            $t("chat.transcript.emptyStateHint")
          }}</span>
        </p>
      </div>

      <div v-for="(entry, index) in transcriptHistory" :key="index" class="flex flex-col gap-0.5">
        <span class="text-[10px] text-gray-400 font-mono">{{ formatTime(entry.timestamp) }}</span>
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

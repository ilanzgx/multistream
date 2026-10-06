<script lang="ts" setup>
import { ref, watch, nextTick, computed } from "vue";
import { useNow } from "@vueuse/core";
import { useTranscription } from "@/composables/useTranscription";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Copy, Trash2, Captions, ArrowDown } from "@lucide/vue";
import { toast } from "@/composables/useToast";
import { useI18n } from "vue-i18n";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const {
  transcriptHistory,
  clearTranscriptHistory,
  selectedModel,
  installedModels,
  isEnabled,
  isDownloading,
  captionMode,
  lastCaptionTime,
  showOverlay,
} = useTranscription();
const { t, locale } = useI18n();
const now = useNow({ interval: 1000 });
const scrollContainer = ref<HTMLElement | null>(null);
const isScrolledUp = ref(false);

function handleScroll() {
  if (scrollContainer.value) {
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value;
    isScrolledUp.value = scrollHeight - scrollTop - clientHeight > 50;
  }
}

function scrollToBottom() {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
    isScrolledUp.value = false;
  }
}

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

function toggleCaptionMode() {
  if (isDownloading.value) return;
  captionMode.value = captionMode.value === "original" ? "translate" : "original";
}

// Auto-scroll to bottom when new entries are added, unless scrolled up
watch(
  () => transcriptHistory.value.length,
  async () => {
    if (isScrolledUp.value) return;
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
    hour12: false,
  }).format(new Date(timestamp));
}

function formatEntryRange(entry: { timestamp: number; endTimestamp?: number }): string {
  if (entry.endTimestamp && entry.endTimestamp > entry.timestamp) {
    return `${formatTime(entry.timestamp)} → ${formatTime(entry.endTimestamp)}`;
  }
  return formatTime(entry.timestamp);
}

function formatInference(ms?: number): string {
  if (ms == null) return "";
  const sec = ms / 1000;
  return sec < 1 ? `${ms}ms` : `${sec.toFixed(1)}s`;
}

function getLanguageDisplayName(code?: string): string {
  if (!code) return "";
  try {
    const displayNames = new Intl.DisplayNames([locale.value || "en"], { type: "language" });
    const name = displayNames.of(code.toLowerCase());
    return name
      ? `${name.charAt(0).toUpperCase() + name.slice(1)} (${code.toUpperCase()})`
      : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

async function copySingleEntry(entry: { text: string; timestamp: number; endTimestamp?: number }) {
  try {
    await navigator.clipboard.writeText(`[${formatEntryRange(entry)}] ${entry.text}`);
    toast.success(t("chat.transcript.copied"), { position: "bottom-right" });
  } catch (err) {
    console.error("Failed to copy transcript entry", err);
  }
}

async function copyTranscript() {
  if (transcriptHistory.value.length === 0) return;

  const text = transcriptHistory.value
    .map((entry) => `[${formatEntryRange(entry)}] ${entry.text}`)
    .join("\n");

  try {
    await navigator.clipboard.writeText(text);
    toast.success(t("chat.transcript.copied"), { position: "bottom-right" });
  } catch (err) {
    console.error("Failed to copy transcript", err);
  }
}
</script>

<template>
  <TooltipProvider :delay-duration="200" :disable-hoverable-content="true">
    <div class="flex flex-col h-full bg-[#0f1115]">
      <!-- Toolbar -->
      <div
        class="flex items-center justify-between gap-2 px-4 pb-3 pt-0 border-b border-[#1f2227] bg-[#191b1f]"
      >
        <!-- Status Block -->
        <div class="flex flex-col gap-0.5 min-w-0">
          <span class="text-[10px] text-gray-400 truncate leading-tight">
            {{ $t("settings.transcription.modelLabel") }}:
            <span class="text-gray-300">{{ formattedModelName }}</span>
          </span>
          <button
            type="button"
            class="text-left text-[10px] text-gray-400 truncate leading-tight hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="isDownloading"
            :title="$t('settings.transcription.captionModeLabel')"
            @click="toggleCaptionMode"
          >
            {{ $t("settings.transcription.modeLabel") }}:
            <span class="text-gray-300 underline decoration-gray-600 underline-offset-2">{{
              $t(captionModeTranslationKey)
            }}</span>
          </button>
          <span v-if="timeAgoText" class="text-[10px] text-gray-400 truncate leading-tight">
            {{ $t("settings.transcription.lastCaption") }}
            <span class="text-gray-300">{{ timeAgoText }}</span>
          </span>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-1.5 shrink-0">
          <Tooltip>
            <TooltipTrigger as-child>
              <div class="flex items-center mr-1">
                <Switch
                  v-model:checked="isEnabled"
                  data-testid="transcription-sidebar-enable-toggle"
                  :aria-label="$t('settings.transcription.enableToggle')"
                  :disabled="isDownloading || installedModels.length === 0"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ $t("settings.transcription.enableToggle") }}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                size="icon"
                data-testid="transcription-overlay-toggle"
                :aria-label="$t('chat.transcript.showOverlay')"
                class="h-6 w-6 transition-colors"
                :class="
                  showOverlay
                    ? 'border-[#3a3f4b] bg-[#2a2d33] text-white hover:bg-[#3a3f4b] hover:text-white'
                    : 'border-[#2a2d33] bg-[#1a1d24] text-gray-400 hover:bg-[#2a2d33] hover:text-white'
                "
                @click="showOverlay = !showOverlay"
              >
                <Captions class="w-3 h-3" />
              </Button>
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
                :aria-label="$t('chat.transcript.copy')"
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
                :aria-label="$t('chat.transcript.clear')"
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
        </div>
      </div>

      <!-- Transcript Area -->
      <div class="flex-1 relative min-h-0">
        <div
          ref="scrollContainer"
          class="absolute inset-0 overflow-y-auto py-1.5 custom-scrollbar"
          @scroll="handleScroll"
        >
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

          <div
            v-for="(entry, index) in transcriptHistory"
            :key="index"
            class="group flex flex-col gap-0.5 px-3 py-1.5 hover:bg-white/[0.03] transition-colors"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
                <span
                  class="text-[11px] text-gray-400 group-hover:text-gray-300 tabular-nums select-none transition-colors"
                >
                  {{ formatEntryRange(entry) }}
                </span>

                <Tooltip v-if="entry.detectedLanguage" :disable-hoverable-content="true">
                  <TooltipTrigger as-child>
                    <span
                      class="text-[10px] text-gray-400 uppercase select-none px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.04] cursor-default font-medium tracking-wide"
                    >
                      {{ entry.detectedLanguage.toUpperCase() }}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" class="pointer-events-none">
                    <p>
                      {{
                        $t("chat.transcript.metrics.languageTooltip", {
                          lang: getLanguageDisplayName(entry.detectedLanguage),
                        })
                      }}
                    </p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip v-if="entry.inferenceDurationMs != null" :disable-hoverable-content="true">
                  <TooltipTrigger as-child>
                    <span
                      class="inline-flex items-center gap-0.5 text-[10px] text-gray-400 tabular-nums select-none px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.04] cursor-default"
                    >
                      {{ formatInference(entry.inferenceDurationMs) }}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" class="pointer-events-none">
                    <p>
                      {{
                        $t("chat.transcript.metrics.inferenceTooltip", {
                          time: formatInference(entry.inferenceDurationMs),
                        })
                      }}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <button
                type="button"
                class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-0.5 rounded text-gray-400 hover:text-white transition-opacity cursor-pointer shrink-0"
                :aria-label="$t('chat.transcript.copy')"
                :title="$t('chat.transcript.copy')"
                @click="copySingleEntry(entry)"
              >
                <Copy class="w-3 h-3" aria-hidden="true" />
              </button>
            </div>

            <p class="text-sm text-gray-300 leading-snug break-words">
              {{ entry.text }}
            </p>
          </div>
        </div>

        <Transition name="fade">
          <div v-if="isScrolledUp" class="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
            <Button
              variant="secondary"
              size="sm"
              class="bg-[#1f232b]/95 hover:bg-[#2a2d33] text-gray-200 border border-white/10 shadow-lg rounded-full px-4 flex items-center gap-2 font-medium backdrop-blur-sm"
              @click="scrollToBottom"
            >
              {{ t("chat.resume") }}
              <ArrowDown class="w-4 h-4" />
            </Button>
          </div>
        </Transition>
      </div>
    </div>
  </TooltipProvider>
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

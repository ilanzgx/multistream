<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TwitchIcon, KickIcon, YoutubeIcon, CustomIcon } from "@/components/icons";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Info,
  Mic,
  Video,
  Folder,
  ShieldCheck,
  Plus,
  Radio,
} from "@lucide/vue";
import { useTranscription } from "@/composables/useTranscription";

const props = withDefaults(
  defineProps<{
    open?: boolean;
    allowOutsideClose?: boolean;
  }>(),
  {
    open: false,
    allowOutsideClose: false,
  }
);

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "complete"): void;
}>();

const currentStep = ref(1);
const { isSupported } = useTranscription();

const visibleSteps = computed(() => {
  const steps = [1, 2, 3, 4];
  if (isSupported.value) steps.push(5);
  steps.push(6, 7);
  return steps;
});

const currentStepIndex = computed(() => {
  const idx = visibleSteps.value.indexOf(currentStep.value);
  return idx === -1 ? 0 : idx;
});

const isFirstStep = computed(() => currentStepIndex.value === 0);
const isLastStep = computed(() => currentStepIndex.value === visibleSteps.value.length - 1);

function handleOutsideClick(e: Event) {
  if (!props.allowOutsideClose) {
    e.preventDefault();
  }
}

function handleOpenChange(isOpen: boolean) {
  emit("update:open", isOpen);
  if (!isOpen) {
    emit("complete");
  }
}

function handleNext() {
  if (!isLastStep.value) {
    const next = visibleSteps.value[currentStepIndex.value + 1];
    if (next !== undefined) currentStep.value = next;
    return;
  }
  handleFinish();
}

function handleBack() {
  if (!isFirstStep.value) {
    const prev = visibleSteps.value[currentStepIndex.value - 1];
    if (prev !== undefined) currentStep.value = prev;
  }
}

function handleSkip() {
  emit("update:open", false);
  emit("complete");
}

function handleFinish() {
  emit("update:open", false);
  emit("complete");
}

function handleKeyDown(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === "ArrowRight") {
    e.preventDefault();
    handleNext();
  } else if (e.key === "ArrowLeft" && !isFirstStep.value) {
    e.preventDefault();
    handleBack();
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      currentStep.value = 1;
      window.addEventListener("keydown", handleKeyDown);
      return;
    }
    window.removeEventListener("keydown", handleKeyDown);
  },
  { immediate: true, flush: "sync" }
);

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
});
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="bg-[#14161a] border-[#2a2d33] max-w-xl md:max-w-2xl outline-none p-6 sm:p-7 h-[560px] flex flex-col justify-between transform-gpu"
      @pointer-down-outside="handleOutsideClick"
    >
      <DialogHeader
        class="flex flex-col items-center text-center justify-start pb-1 h-[80px] shrink-0"
      >
        <DialogTitle class="text-white text-lg sm:text-xl font-semibold tracking-tight">
          {{
            currentStep === 1 ? $t("onboarding.title") : $t(`onboarding.step${currentStep}.title`)
          }}
        </DialogTitle>
        <DialogDescription
          class="text-center text-gray-400 text-xs sm:text-sm mt-1.5 leading-5 max-w-xl mx-auto"
        >
          {{ $t(`onboarding.step${currentStep}.description`, { key: "D", keys: "1–9" }) }}
        </DialogDescription>
      </DialogHeader>

      <div class="relative flex-1 flex flex-col min-h-0" aria-live="polite">
        <Transition name="step-fade" mode="out-in">
          <div :key="currentStep" class="w-full flex-1 flex flex-col justify-between gap-3">
            <div class="flex-1 flex flex-col justify-start pt-1">
              <!-- STEP 1: Studio Multi-Stream Grid Diagram -->
              <div
                v-if="currentStep === 1"
                aria-hidden="true"
                class="flex flex-col gap-2.5 p-3.5 bg-[#181a1f] rounded-xl border border-[#262930] select-none pointer-events-none"
              >
                <!-- Asymmetric 75% / 25% Studio Grid Preview -->
                <div class="grid grid-cols-12 gap-2 h-36">
                  <!-- Primary Focused Stream Tile -->
                  <div
                    class="col-span-8 bg-[#0f1115] border border-[#2a2d33] rounded-lg p-2.5 flex flex-col justify-between relative overflow-hidden"
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-1.5">
                        <TwitchIcon class="size-3.5 text-[#9146FF] shrink-0" />
                        <span class="text-xs font-medium text-white truncate">gaules</span>
                      </div>
                      <span
                        class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/70 border border-white/10 text-xs text-gray-300 tabular-nums"
                      >
                        <span class="size-1.5 rounded-full bg-[#e11d48]" />
                        42.8k
                      </span>
                    </div>

                    <div class="flex items-center justify-center">
                      <Radio class="size-6 text-white/10" />
                    </div>

                    <div class="flex items-center justify-between">
                      <span class="text-xs text-gray-400 tabular-nums">1080p60</span>
                      <kbd
                        class="px-1.5 py-0.5 text-xs font-medium text-gray-300 bg-[#1e2127] border border-[#3a3f4b] rounded"
                        >F</kbd
                      >
                    </div>
                  </div>

                  <!-- Right Stack: Secondary Stream + Add Slot -->
                  <div class="col-span-4 flex flex-col gap-2">
                    <div
                      class="flex-1 bg-[#0f1115] border border-[#2a2d33] rounded-lg p-2.5 flex flex-col justify-between"
                    >
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-1.5 truncate">
                          <KickIcon class="size-3 text-[#53FC18] shrink-0" />
                          <span class="text-xs font-medium text-gray-200 truncate">ninja</span>
                        </div>
                        <span class="size-1.5 rounded-full bg-[#e11d48] shrink-0" />
                      </div>
                      <span class="text-xs text-gray-400 tabular-nums self-end">19.4k</span>
                    </div>

                    <div
                      class="flex-1 bg-[#14161a]/60 border border-dashed border-[#3a3f4b] rounded-lg p-2 flex items-center justify-center gap-1.5 text-gray-400"
                    >
                      <Plus class="size-3.5 text-gray-400 shrink-0" />
                      <kbd
                        class="px-1.5 py-0.5 text-xs font-semibold text-white bg-[#1e2127] border border-[#3a3f4b] rounded"
                        >D</kbd
                      >
                    </div>
                  </div>
                </div>

                <!-- Supported Platforms Strip -->
                <div class="grid grid-cols-4 gap-2 pt-0.5 text-xs text-gray-300 font-medium">
                  <div
                    class="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-[#14161a] border border-[#262930]"
                  >
                    <TwitchIcon class="size-3.5 text-[#9146FF] shrink-0" />
                    <span class="truncate">Twitch</span>
                  </div>
                  <div
                    class="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-[#14161a] border border-[#262930]"
                  >
                    <KickIcon class="size-3.5 text-[#53FC18] shrink-0" />
                    <span class="truncate">Kick</span>
                  </div>
                  <div
                    class="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-[#14161a] border border-[#262930]"
                  >
                    <YoutubeIcon class="size-3.5 text-[#FF0000] shrink-0" />
                    <span class="truncate">YouTube</span>
                  </div>
                  <div
                    class="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-[#14161a] border border-[#262930]"
                  >
                    <CustomIcon class="size-3.5 text-[#6366F1] shrink-0" />
                    <span class="truncate">{{ $t("onboarding.step1.customPlatform") }}</span>
                  </div>
                </div>
              </div>

              <!-- STEP 2: Split Studio Chat Diagram (Unified Chat + 1-9 Switcher) -->
              <div
                v-else-if="currentStep === 2"
                aria-hidden="true"
                class="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-3.5 bg-[#181a1f] rounded-xl border border-[#262930] select-none pointer-events-none"
              >
                <!-- Unified Chat Feed Preview -->
                <div
                  class="sm:col-span-7 bg-[#0f1115] border border-[#2a2d33] rounded-lg p-3 flex flex-col justify-between gap-2.5"
                >
                  <div class="flex items-center justify-between border-b border-[#1f2227] pb-2">
                    <span class="text-xs font-semibold text-white truncate">{{
                      $t("chat.unified.selectorLabel")
                    }}</span>
                    <div class="flex items-center gap-1.5">
                      <TwitchIcon class="size-3 text-[#9146FF]" />
                      <KickIcon class="size-3 text-[#53FC18]" />
                    </div>
                  </div>

                  <div class="flex flex-col gap-2 text-xs">
                    <div class="flex items-center gap-2">
                      <span class="w-[3px] h-4 rounded-full bg-[#9146FF] shrink-0" />
                      <TwitchIcon class="size-3 text-[#9146FF] shrink-0" />
                      <span class="font-medium text-gray-200">gaules:</span>
                      <span class="h-2 w-24 rounded bg-[#1f2227]" />
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="w-[3px] h-4 rounded-full bg-[#53FC18] shrink-0" />
                      <KickIcon class="size-3 text-[#53FC18] shrink-0" />
                      <span class="font-medium text-gray-200">ninja:</span>
                      <span class="h-2 w-20 rounded bg-[#1f2227]" />
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="w-[3px] h-4 rounded-full bg-[#9146FF] shrink-0" />
                      <TwitchIcon class="size-3 text-[#9146FF] shrink-0" />
                      <span class="font-medium text-gray-200">lolesports:</span>
                      <span class="h-2 w-16 rounded bg-[#1f2227]" />
                    </div>
                  </div>
                </div>

                <!-- 1-9 Channel Switcher Preview -->
                <div
                  class="sm:col-span-5 bg-[#0f1115] border border-[#2a2d33] rounded-lg p-3 flex flex-col justify-between gap-2"
                >
                  <div class="flex items-center justify-between border-b border-[#1f2227] pb-2">
                    <span class="text-xs font-medium text-gray-300 truncate">{{
                      $t("onboarding.step2.chatActive")
                    }}</span>
                    <span class="text-xs font-mono text-gray-400 tabular-nums">1–9</span>
                  </div>

                  <div class="flex flex-col gap-1.5 text-xs">
                    <div
                      class="flex items-center justify-between px-2 py-1.5 rounded bg-[#14161a] border border-[#262930]"
                    >
                      <div class="flex items-center gap-2 truncate">
                        <kbd
                          class="px-1.5 py-0.5 text-xs font-medium text-gray-400 bg-[#1e2127] border border-[#2a2d33] rounded tabular-nums"
                          >1</kbd
                        >
                        <span class="text-gray-400 truncate">gaules</span>
                      </div>
                      <TwitchIcon class="size-3 text-[#9146FF] shrink-0" />
                    </div>

                    <div
                      class="flex items-center justify-between px-2 py-1.5 rounded bg-[#1e2127] border border-white/25"
                    >
                      <div class="flex items-center gap-2 truncate">
                        <kbd
                          class="px-1.5 py-0.5 text-xs font-semibold text-white bg-[#14161a] border border-white/30 rounded tabular-nums"
                          >2</kbd
                        >
                        <span class="text-white font-medium truncate">ninja</span>
                      </div>
                      <KickIcon class="size-3 text-[#53FC18] shrink-0" />
                    </div>

                    <div
                      class="flex items-center justify-between px-2 py-1.5 rounded bg-[#14161a] border border-[#262930]"
                    >
                      <div class="flex items-center gap-2 truncate">
                        <kbd
                          class="px-1.5 py-0.5 text-xs font-medium text-gray-400 bg-[#1e2127] border border-[#2a2d33] rounded tabular-nums"
                          >3</kbd
                        >
                        <span class="text-gray-400 truncate">lolesports</span>
                      </div>
                      <TwitchIcon class="size-3 text-[#9146FF] shrink-0" />
                    </div>
                  </div>
                </div>
              </div>

              <!-- STEP 3: Platform Capabilities Matrix (Twitch & Kick) -->
              <div
                v-else-if="currentStep === 3"
                aria-hidden="true"
                class="flex flex-col gap-2.5 p-3.5 bg-[#181a1f] rounded-xl border border-[#262930] select-none pointer-events-none"
              >
                <!-- Twitch Row -->
                <div
                  class="flex flex-col gap-2.5 p-3 bg-[#0f1115] border border-[#2a2d33] rounded-lg"
                >
                  <div class="flex items-center gap-2.5">
                    <div class="p-1.5 rounded-md bg-[#9146FF]/10 text-[#9146FF] shrink-0">
                      <TwitchIcon class="size-4" />
                    </div>
                    <div class="flex flex-col min-w-0">
                      <span class="text-xs font-semibold text-white">Twitch</span>
                      <span class="text-xs text-gray-400 truncate">{{
                        $t("onboarding.step3.twitchSub")
                      }}</span>
                    </div>
                  </div>
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#14161a] border border-[#262930] text-xs text-gray-300"
                    >
                      <Check class="size-3 text-[#9146FF] shrink-0" />
                      {{ $t("onboarding.step3.feature1") }}
                    </span>
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#14161a] border border-[#262930] text-xs text-gray-300"
                    >
                      <Check class="size-3 text-[#9146FF] shrink-0" />
                      {{ $t("onboarding.step3.badgeEmotes") }}
                    </span>
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#14161a] border border-[#262930] text-xs text-gray-300"
                    >
                      <Check class="size-3 text-[#9146FF] shrink-0" />
                      {{ $t("onboarding.step3.feature3") }}
                    </span>
                  </div>
                </div>

                <!-- Kick Row -->
                <div
                  class="flex flex-col gap-2.5 p-3 bg-[#0f1115] border border-[#2a2d33] rounded-lg"
                >
                  <div class="flex items-center gap-2.5">
                    <div class="p-1.5 rounded-md bg-[#53FC18]/10 text-[#53FC18] shrink-0">
                      <KickIcon class="size-4" />
                    </div>
                    <div class="flex flex-col min-w-0">
                      <span class="text-xs font-semibold text-white">Kick</span>
                      <span class="text-xs text-gray-400 truncate">{{
                        $t("onboarding.step3.kickSub")
                      }}</span>
                    </div>
                  </div>
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#14161a] border border-[#262930] text-xs text-gray-300"
                    >
                      <Check class="size-3 text-[#53FC18] shrink-0" />
                      {{ $t("onboarding.step3.feature1") }}
                    </span>
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#14161a] border border-[#262930] text-xs text-gray-300"
                    >
                      <Check class="size-3 text-[#53FC18] shrink-0" />
                      {{ $t("onboarding.step3.badgeEmotes") }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- STEP 4: Browse by Category Shelf Diagram -->
              <div
                v-else-if="currentStep === 4"
                aria-hidden="true"
                class="flex flex-col gap-3 p-3.5 bg-[#181a1f] rounded-xl border border-[#262930] select-none pointer-events-none"
              >
                <!-- Category filter chips -->
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span
                    class="px-2.5 py-1 rounded-full text-xs font-medium bg-[#14161a] text-gray-400 border border-[#2a2d33]"
                    >{{ $t("add.categoryAll") }}</span
                  >
                  <span
                    class="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 text-white border border-white/20"
                    >Valorant</span
                  >
                  <span
                    class="px-2.5 py-1 rounded-full text-xs font-medium bg-[#14161a] text-gray-400 border border-[#2a2d33]"
                    >CS2</span
                  >
                  <span
                    class="px-2.5 py-1 rounded-full text-xs font-medium bg-[#14161a] text-gray-400 border border-[#2a2d33]"
                    >League of Legends</span
                  >
                </div>

                <!-- Studio Discovery Preview Cards -->
                <div class="grid grid-cols-3 gap-2.5">
                  <div
                    class="flex flex-col rounded-lg bg-[#14161a] border border-[#262930] overflow-hidden"
                  >
                    <div
                      class="aspect-video w-full bg-gradient-to-b from-[#1e222a] to-[#0f1115] border-b border-[#262930] relative p-2 flex flex-col justify-between"
                    >
                      <div class="flex items-center justify-between">
                        <span
                          class="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded bg-[#e11d48] text-white scale-90 origin-top-left"
                        >
                          {{ $t("nativePlayer.live") }}
                        </span>
                      </div>
                      <Radio
                        class="size-5 text-white/10 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                      />
                      <span
                        class="self-end text-xs px-1.5 py-0.5 rounded bg-black/80 text-gray-200 font-medium tabular-nums scale-90 origin-bottom-right"
                        >42.8k</span
                      >
                    </div>
                    <div class="p-2 flex items-center justify-between gap-1.5">
                      <span class="text-xs font-medium text-white truncate">tenz</span>
                      <TwitchIcon class="size-3 text-[#9146FF] shrink-0" />
                    </div>
                  </div>

                  <div
                    class="flex flex-col rounded-lg bg-[#14161a] border border-[#262930] overflow-hidden"
                  >
                    <div
                      class="aspect-video w-full bg-gradient-to-b from-[#1e222a] to-[#0f1115] border-b border-[#262930] relative p-2 flex flex-col justify-between"
                    >
                      <div class="flex items-center justify-between">
                        <span
                          class="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded bg-[#e11d48] text-white scale-90 origin-top-left"
                        >
                          {{ $t("nativePlayer.live") }}
                        </span>
                      </div>
                      <Radio
                        class="size-5 text-white/10 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                      />
                      <span
                        class="self-end text-xs px-1.5 py-0.5 rounded bg-black/80 text-gray-200 font-medium tabular-nums scale-90 origin-bottom-right"
                        >19.4k</span
                      >
                    </div>
                    <div class="p-2 flex items-center justify-between gap-1.5">
                      <span class="text-xs font-medium text-white truncate">gaules</span>
                      <KickIcon class="size-3 text-[#53FC18] shrink-0" />
                    </div>
                  </div>

                  <div
                    class="flex flex-col rounded-lg bg-[#14161a] border border-[#262930] overflow-hidden"
                  >
                    <div
                      class="aspect-video w-full bg-gradient-to-b from-[#1e222a] to-[#0f1115] border-b border-[#262930] relative p-2 flex flex-col justify-between"
                    >
                      <div class="flex items-center justify-between">
                        <span
                          class="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded bg-[#e11d48] text-white scale-90 origin-top-left"
                        >
                          {{ $t("nativePlayer.live") }}
                        </span>
                      </div>
                      <Radio
                        class="size-5 text-white/10 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                      />
                      <span
                        class="self-end text-xs px-1.5 py-0.5 rounded bg-black/80 text-gray-200 font-medium tabular-nums scale-90 origin-bottom-right"
                        >12.1k</span
                      >
                    </div>
                    <div class="p-2 flex items-center justify-between gap-1.5">
                      <span class="text-xs font-medium text-white truncate">sacy</span>
                      <TwitchIcon class="size-3 text-[#9146FF] shrink-0" />
                    </div>
                  </div>
                </div>
              </div>

              <!-- STEP 5: Live Transcription (Whisper CPU Overlay Diagram) -->
              <div
                v-else-if="currentStep === 5"
                aria-hidden="true"
                class="flex flex-col gap-2.5 p-3.5 bg-[#181a1f] rounded-xl border border-[#262930] select-none pointer-events-none"
              >
                <!-- Top Whisper Status Bar -->
                <div class="flex items-center justify-between px-1">
                  <div class="flex items-center gap-2">
                    <div class="p-1.5 rounded-md bg-white/5 text-gray-300">
                      <Mic class="size-3.5" />
                    </div>
                    <span class="text-xs font-semibold text-white">{{
                      $t("onboarding.step5.badgeWhisper")
                    }}</span>
                  </div>
                  <span
                    class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-white/5 text-gray-300 border border-white/10"
                  >
                    <ShieldCheck class="size-3.5 text-gray-400" />
                    {{ $t("onboarding.step5.badgeLocal") }}
                  </span>
                </div>

                <!-- Broadcast Frame with Receding Opacity Subtitle Overlay -->
                <div
                  class="bg-[#0f1115] border border-[#2a2d33] rounded-lg p-4 flex flex-col items-center justify-end gap-2 min-h-[124px] relative overflow-hidden"
                >
                  <Radio class="size-6 text-white/10 mb-auto mt-1" />

                  <span
                    class="text-xs text-gray-300 px-3 py-1 bg-[#14161a]/90 border border-[#2a2d33] rounded opacity-65 text-center"
                  >
                    {{ $t("onboarding.step5.captionOriginal") }}
                  </span>
                  <span
                    class="text-xs text-white px-3.5 py-1.5 bg-[#1e2127] border border-[#3a3f4b] rounded font-medium shadow-sm text-center"
                  >
                    {{ $t("onboarding.step5.captionTranslation") }}
                  </span>
                </div>
              </div>

              <!-- STEP 6: Local Recording Pipeline Diagram -->
              <div
                v-else-if="currentStep === 6"
                aria-hidden="true"
                class="flex flex-col gap-2.5 p-3.5 bg-[#181a1f] rounded-xl border border-[#262930] select-none pointer-events-none"
              >
                <!-- Source Capture Row -->
                <div
                  class="flex items-center justify-between p-3 bg-[#0f1115] border border-[#262930] rounded-lg"
                >
                  <div class="flex items-center gap-2.5">
                    <div class="p-1.5 rounded-md bg-white/5 text-gray-300">
                      <Video class="size-4" />
                    </div>
                    <div class="flex flex-col">
                      <span class="text-xs font-semibold text-white">{{
                        $t("onboarding.step6.title")
                      }}</span>
                      <span class="text-xs text-gray-400 tabular-nums">1080p60</span>
                    </div>
                  </div>
                  <span
                    class="text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1.5 tabular-nums"
                  >
                    <span class="size-1.5 rounded-full bg-red-500" />
                    {{ $t("onboarding.step6.badgeRec") }} • 00:14:22
                  </span>
                </div>

                <!-- Output MP4 Destination Row -->
                <div
                  class="flex items-center gap-2.5 px-3 py-2.5 bg-[#14161a] border border-[#262930] rounded-lg text-xs text-gray-300"
                >
                  <Folder class="size-3.5 text-gray-400 shrink-0" />
                  <span class="font-mono truncate">Videos/Multistream/stream_1080p60.mp4</span>
                  <span
                    class="ml-auto text-xs font-medium px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300 shrink-0"
                  >
                    {{ $t("onboarding.step6.badgeFormat") }}
                  </span>
                </div>
              </div>

              <!-- STEP 7: 2x2 Keyboard Shortcuts Grid -->
              <div
                v-else-if="currentStep === 7"
                class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3.5 bg-[#181a1f] rounded-xl border border-[#262930]"
              >
                <!-- D Key -->
                <div
                  class="flex items-center gap-3 p-3 bg-[#14161a] border border-[#262930] rounded-lg"
                >
                  <kbd
                    class="flex items-center justify-center size-8 text-xs font-semibold text-white bg-[#1e2127] border border-[#3a3f4b] rounded-lg shadow-xs shrink-0"
                    >D</kbd
                  >
                  <div class="flex flex-col min-w-0">
                    <span class="text-xs font-semibold text-white truncate">{{
                      $t("onboarding.step1.title")
                    }}</span>
                    <span class="text-xs text-gray-400 truncate">{{
                      $t("onboarding.step7.add")
                    }}</span>
                  </div>
                </div>

                <!-- F Key -->
                <div
                  class="flex items-center gap-3 p-3 bg-[#14161a] border border-[#262930] rounded-lg"
                >
                  <kbd
                    class="flex items-center justify-center size-8 text-xs font-semibold text-white bg-[#1e2127] border border-[#3a3f4b] rounded-lg shadow-xs shrink-0"
                    >F</kbd
                  >
                  <div class="flex flex-col min-w-0">
                    <span class="text-xs font-semibold text-white truncate">{{
                      $t("onboarding.step7.focusTitle")
                    }}</span>
                    <span class="text-xs text-gray-400 truncate">{{
                      $t("onboarding.step7.focus")
                    }}</span>
                  </div>
                </div>

                <!-- S Key -->
                <div
                  class="flex items-center gap-3 p-3 bg-[#14161a] border border-[#262930] rounded-lg"
                >
                  <kbd
                    class="flex items-center justify-center size-8 text-xs font-semibold text-white bg-[#1e2127] border border-[#3a3f4b] rounded-lg shadow-xs shrink-0"
                    >S</kbd
                  >
                  <div class="flex flex-col min-w-0">
                    <span class="text-xs font-semibold text-white truncate">{{
                      $t("onboarding.step7.screenshotTitle")
                    }}</span>
                    <span class="text-xs text-gray-400 truncate">{{
                      $t("onboarding.step7.screenshot")
                    }}</span>
                  </div>
                </div>

                <!-- 1-9 Keys -->
                <div
                  class="flex items-center gap-3 p-3 bg-[#14161a] border border-[#262930] rounded-lg"
                >
                  <div class="flex items-center gap-1 shrink-0">
                    <kbd
                      class="flex items-center justify-center size-8 text-xs font-semibold text-white bg-[#1e2127] border border-[#3a3f4b] rounded-lg shadow-xs tabular-nums"
                      >1</kbd
                    >
                    <span class="text-gray-400 font-semibold text-xs">–</span>
                    <kbd
                      class="flex items-center justify-center size-8 text-xs font-semibold text-white bg-[#1e2127] border border-[#3a3f4b] rounded-lg shadow-xs tabular-nums"
                      >9</kbd
                    >
                  </div>
                  <div class="flex flex-col min-w-0">
                    <span class="text-xs font-semibold text-white truncate">{{
                      $t("onboarding.step2.title")
                    }}</span>
                    <span class="text-xs text-gray-400 truncate">{{
                      $t("onboarding.step7.chat", { keys: "1–9" })
                    }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Practical Context / How to Use Note -->
            <div
              class="shrink-0 min-h-[108px] flex flex-col justify-start gap-1.5 px-4 py-3 rounded-lg bg-[#0f1115]/90 border border-[#262930] text-left"
            >
              <div class="flex items-center gap-1.5 text-xs font-semibold text-white">
                <Info class="size-3.5 text-gray-400 shrink-0" aria-hidden="true" />
                <span>{{ $t("onboarding.hintLabel") }}</span>
              </div>
              <p class="text-xs sm:text-sm text-gray-300 leading-5">
                {{ $t(`onboarding.step${currentStep}.hint`, { key: "D", keys: "1–9" }) }}
              </p>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Footer Actions & Progress Indicators -->
      <div class="flex items-center justify-between pt-3 border-t border-[#262930]">
        <div class="flex items-center gap-0.5">
          <button
            v-for="(step, idx) in visibleSteps"
            :key="step"
            type="button"
            class="min-h-[32px] min-w-[24px] px-1 flex items-center justify-center group cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            :aria-label="$t('onboarding.goToStep', { step: idx + 1 })"
            :aria-current="step === currentStep ? 'step' : undefined"
            @click="currentStep = step"
          >
            <span
              class="h-1.5 rounded-full transition-all duration-200"
              :class="[
                step === currentStep ? 'bg-white w-4' : 'bg-gray-500 w-1.5 group-hover:bg-gray-300',
              ]"
            />
          </button>
        </div>

        <div class="flex items-center gap-2">
          <Button
            v-if="!isLastStep"
            variant="ghost"
            size="sm"
            class="text-gray-400 hover:text-white hover:bg-white/5 active:scale-[0.98] transition-all text-xs cursor-pointer"
            @click="handleSkip"
          >
            {{ $t("onboarding.skip") }}
          </Button>

          <Button
            v-if="!isFirstStep"
            variant="outline"
            size="sm"
            class="border-[#2a2d33] bg-transparent text-gray-300 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] active:scale-[0.98] transition-all text-xs cursor-pointer"
            @click="handleBack"
          >
            <ChevronLeft class="size-3.5 mr-1" aria-hidden="true" />
            {{ $t("onboarding.back") }}
          </Button>

          <Button
            size="sm"
            class="bg-white text-[#14161a] hover:bg-gray-200 active:scale-[0.98] transition-all font-medium text-xs border-transparent cursor-pointer"
            @click="handleNext"
          >
            <template v-if="isLastStep">
              <Check class="size-3.5 mr-1" aria-hidden="true" />
              {{ $t("onboarding.finish") }}
            </template>
            <template v-else>
              {{ $t("onboarding.next") }}
              <ChevronRight class="size-3.5 ml-1" aria-hidden="true" />
            </template>
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.step-fade-enter-active,
.step-fade-leave-active {
  transition: opacity 0.15s ease;
}
.step-fade-enter-from,
.step-fade-leave-to {
  opacity: 0;
}
</style>

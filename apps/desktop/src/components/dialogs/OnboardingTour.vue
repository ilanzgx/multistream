<script setup lang="ts">
import { ref, watch } from "vue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TwitchIcon, KickIcon, YoutubeIcon } from "@/components/icons";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Mic,
  Video,
  Globe,
  Folder,
  ShieldCheck,
  Zap,
  ArrowDown,
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

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      currentStep.value = 1;
    }
  }
);

function handleOutsideClick(e: Event) {
  if (!props.allowOutsideClose) {
    e.preventDefault();
  }
}

function handleEscapeKey(e: Event) {
  if (!props.allowOutsideClose) {
    e.preventDefault();
  }
}

function getNextStep(from: number): number {
  let step = from + 1;
  if (step === 5 && !isSupported.value) step++;
  return step;
}

function getPrevStep(from: number): number {
  let step = from - 1;
  if (step === 5 && !isSupported.value) step--;
  return step;
}

function handleNext() {
  if (currentStep.value < 7) {
    currentStep.value = getNextStep(currentStep.value);
  } else {
    handleFinish();
  }
}

function handleBack() {
  if (currentStep.value > 1) {
    currentStep.value = getPrevStep(currentStep.value);
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
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="bg-[#14161a] border-[#2a2d33] max-w-lg md:max-w-xl outline-none p-6 h-[480px] flex flex-col justify-between"
      @pointer-down-outside="handleOutsideClick"
      @escape-key-down="handleEscapeKey"
    >
      <!-- Header with stable height across all steps to prevent jumping/flickering -->
      <DialogHeader class="flex flex-col items-center text-center justify-start pb-1 min-h-[64px]">
        <DialogTitle class="text-white text-lg sm:text-xl font-semibold tracking-tight">
          {{
            currentStep === 1 ? $t("onboarding.title") : $t(`onboarding.step${currentStep}.title`)
          }}
        </DialogTitle>
        <DialogDescription
          class="text-center text-gray-400 text-xs sm:text-sm mt-0.5 leading-relaxed max-w-lg mx-auto"
        >
          {{ $t(`onboarding.step${currentStep}.description`, { key: "D", keys: "1-9" }) }}
        </DialogDescription>
      </DialogHeader>

      <!-- Fixed-Height Step Content Area -->
      <div class="relative flex-1 flex flex-col justify-center my-auto">
        <Transition name="step-fade" mode="out-in">
          <div :key="currentStep" class="w-full flex flex-col justify-center">
            <!-- STEP 1: Add Stream & Platforms -->
            <div v-if="currentStep === 1" class="flex flex-col gap-3">
              <!-- Action hint inside Step 1 -->
              <div class="flex items-center justify-center">
                <span class="text-xs text-gray-300 font-medium">
                  {{ $t("onboarding.step1.howToAdd", { key: "D" }) }}
                </span>
              </div>

              <!-- Platform & Search Card -->
              <div class="flex flex-col gap-3 p-4 bg-[#181a1f] rounded-xl border border-[#262930]">
                <!-- Platform selector buttons -->
                <div class="grid grid-cols-4 gap-2">
                  <div
                    class="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-[#9146FF]/10 border border-[#9146FF]/50 text-white text-xs font-medium"
                  >
                    <TwitchIcon class="size-3.5 text-[#9146FF] shrink-0" />
                    <span class="truncate">Twitch</span>
                  </div>
                  <div
                    class="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-[#14161a] border border-[#262930] text-gray-400 text-xs font-medium"
                  >
                    <KickIcon class="size-3.5 text-[#53FC18] shrink-0" />
                    <span class="truncate">Kick</span>
                  </div>
                  <div
                    class="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-[#14161a] border border-[#262930] text-gray-400 text-xs font-medium"
                  >
                    <YoutubeIcon class="size-3.5 text-[#FF0000] shrink-0" />
                    <span class="truncate">YouTube</span>
                  </div>
                  <div
                    class="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-[#14161a] border border-[#262930] text-gray-400 text-xs font-medium"
                  >
                    <Globe class="size-3.5 text-gray-400 shrink-0" />
                    <span class="truncate">{{ $t("onboarding.step1.customPlatform") }}</span>
                  </div>
                </div>

                <!-- Search input preview -->
                <div
                  class="flex items-center justify-between px-3.5 py-2.5 bg-[#0f1115] border border-[#2a2d33] rounded-lg"
                >
                  <div class="flex items-center gap-2 truncate">
                    <TwitchIcon class="size-3.5 text-[#9146FF] shrink-0" />
                    <span class="h-3.5 w-px bg-[#2a2d33]" />
                    <span class="text-xs text-gray-400 truncate">twitch.tv/channel_name...</span>
                  </div>
                  <kbd
                    class="px-2 py-0.5 text-xs font-medium text-gray-300 bg-[#1e2127] border border-[#2a2d33] rounded shrink-0 ml-2"
                    >D</kbd
                  >
                </div>
              </div>

              <!-- Value highlights: outside the card, standard neutral icons without button style -->
              <div class="flex items-center justify-around px-2 pt-1 pb-3 text-xs text-gray-400">
                <div class="flex items-center gap-1.5">
                  <ShieldCheck class="size-3.5 text-gray-400 shrink-0" />
                  <span>{{ $t("onboarding.step1.tagPrivate") }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <Zap class="size-3.5 text-gray-400 shrink-0" />
                  <span>{{ $t("onboarding.step1.tagLightweight") }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <Globe class="size-3.5 text-gray-400 shrink-0" />
                  <span>{{ $t("onboarding.step1.tagLanguages") }}</span>
                </div>
              </div>
            </div>

            <!-- STEP 2: Select Chat -->
            <div
              v-else-if="currentStep === 2"
              class="flex flex-col gap-3 p-4 bg-[#181a1f] rounded-xl border border-[#262930]"
            >
              <!-- Active chat preview bar -->
              <div
                class="flex items-center justify-between px-3.5 py-2.5 bg-[#0f1115] border border-[#2a2d33] rounded-lg"
              >
                <div class="flex items-center gap-2.5">
                  <span class="size-2 rounded-full bg-[#53FC18]" />
                  <span class="text-xs text-white font-medium">ninja (Kick)</span>
                </div>
                <span
                  class="text-[10px] font-medium px-2 py-0.5 rounded bg-[#53FC18]/10 text-[#53FC18] border border-[#53FC18]/20"
                >
                  {{ $t("onboarding.step2.chatActive") }}
                </span>
              </div>

              <!-- Channel key switchers -->
              <div class="grid grid-cols-3 gap-2">
                <div
                  class="flex items-center gap-2 p-2 bg-[#14161a] border border-[#262930] rounded-lg text-xs"
                >
                  <kbd
                    class="px-1.5 py-0.5 text-xs font-medium text-gray-400 bg-[#1e2127] border border-[#2a2d33] rounded"
                    >1</kbd
                  >
                  <span class="text-gray-400 truncate">gaules</span>
                </div>
                <div
                  class="flex items-center gap-2 p-2 bg-[#14161a] border border-white/20 rounded-lg text-xs"
                >
                  <kbd
                    class="px-1.5 py-0.5 text-xs font-medium text-white bg-[#1e2127] border border-white/30 rounded"
                    >2</kbd
                  >
                  <span class="text-white font-medium truncate">ninja</span>
                </div>
                <div
                  class="flex items-center gap-2 p-2 bg-[#14161a] border border-[#262930] rounded-lg text-xs"
                >
                  <kbd
                    class="px-1.5 py-0.5 text-xs font-medium text-gray-400 bg-[#1e2127] border border-[#2a2d33] rounded"
                    >3</kbd
                  >
                  <span class="text-gray-400 truncate">lolesports</span>
                </div>
              </div>

              <!-- Switcher instructions -->
              <div class="flex items-center justify-center gap-1.5 pt-1 text-xs text-gray-400">
                <span>{{ $t("onboarding.step2.pressKeys") }}</span>
                <div class="flex items-center gap-1">
                  <kbd
                    class="px-1.5 py-0.5 text-xs font-medium text-gray-300 bg-[#14161a] border border-[#2a2d33] rounded"
                    >1</kbd
                  >
                  <span class="text-gray-600">-</span>
                  <kbd
                    class="px-1.5 py-0.5 text-xs font-medium text-gray-300 bg-[#14161a] border border-[#2a2d33] rounded"
                    >9</kbd
                  >
                </div>
                <span>{{ $t("onboarding.step2.switchImmediately") }}</span>
              </div>
            </div>

            <!-- STEP 3: Connect Accounts -->
            <div
              v-else-if="currentStep === 3"
              class="flex flex-col gap-2.5 p-4 bg-[#181a1f] rounded-xl border border-[#262930]"
            >
              <!-- Twitch Connection Card -->
              <div
                class="flex items-center justify-between p-3 bg-[#14161a] border border-[#262930] rounded-lg"
              >
                <div class="flex items-center gap-2.5">
                  <div class="p-1.5 rounded-md bg-[#9146FF]/10 text-[#9146FF]">
                    <TwitchIcon class="size-4" />
                  </div>
                  <div class="flex flex-col">
                    <span class="text-xs font-semibold text-white">Twitch</span>
                    <span class="text-[11px] text-gray-400">{{
                      $t("onboarding.step3.twitchSub")
                    }}</span>
                  </div>
                </div>
                <span
                  class="text-[10px] font-medium px-2 py-0.5 rounded bg-[#9146FF]/10 text-[#9146FF] border border-[#9146FF]/20"
                >
                  {{ $t("onboarding.step3.badgeAuth") }}
                </span>
              </div>

              <!-- Kick Connection Card -->
              <div
                class="flex items-center justify-between p-3 bg-[#14161a] border border-[#262930] rounded-lg"
              >
                <div class="flex items-center gap-2.5">
                  <div class="p-1.5 rounded-md bg-[#53FC18]/10 text-[#53FC18]">
                    <KickIcon class="size-4" />
                  </div>
                  <div class="flex flex-col">
                    <span class="text-xs font-semibold text-white">Kick</span>
                    <span class="text-[11px] text-gray-400">{{
                      $t("onboarding.step3.kickSub")
                    }}</span>
                  </div>
                </div>
                <span
                  class="text-[10px] font-medium px-2 py-0.5 rounded bg-[#53FC18]/10 text-[#53FC18] border border-[#53FC18]/20"
                >
                  {{ $t("onboarding.step3.badgeAuth") }}
                </span>
              </div>

              <!-- Feature Tags -->
              <div class="grid grid-cols-3 gap-2 pt-0.5">
                <div
                  class="flex items-center justify-center text-center p-1.5 bg-[#14161a] border border-[#262930] rounded-md text-[11px] text-gray-300 font-medium"
                >
                  {{ $t("onboarding.step3.badgeEmotes") }}
                </div>
                <div
                  class="flex items-center justify-center text-center p-1.5 bg-[#14161a] border border-[#262930] rounded-md text-[11px] text-gray-300 font-medium"
                >
                  {{ $t("onboarding.step3.feature1") }}
                </div>
                <div
                  class="flex items-center justify-center text-center p-1.5 bg-[#14161a] border border-[#262930] rounded-md text-[11px] text-gray-300 font-medium"
                >
                  {{ $t("onboarding.step3.feature3") }}
                </div>
              </div>
            </div>

            <!-- STEP 4: Browse by Category -->
            <div
              v-else-if="currentStep === 4"
              class="flex flex-col gap-3 p-4 bg-[#181a1f] rounded-xl border border-[#262930]"
            >
              <!-- Category filters -->
              <div class="flex items-center gap-1.5 flex-wrap">
                <span
                  class="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#14161a] text-gray-400 border border-[#2a2d33]"
                  >{{ $t("add.categoryAll") }}</span
                >
                <span
                  class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/10 text-white border border-white/20"
                  >Valorant</span
                >
                <span
                  class="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#14161a] text-gray-400 border border-[#2a2d33]"
                  >Just Chatting</span
                >
                <span
                  class="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#14161a] text-gray-400 border border-[#2a2d33]"
                  >CS:GO 2</span
                >
              </div>

              <!-- Stream preview cards -->
              <div class="grid grid-cols-3 gap-2">
                <div
                  class="flex flex-col rounded-lg bg-[#14161a] border border-[#262930] overflow-hidden"
                >
                  <div
                    class="aspect-video w-full bg-[#0f1115] relative p-1.5 flex flex-col justify-between"
                  >
                    <span
                      class="self-start text-[8px] font-bold px-1 py-0.2 rounded bg-red-600 text-white"
                      >LIVE</span
                    >
                    <span
                      class="self-end text-[9px] px-1.5 py-0.2 rounded bg-black/80 text-gray-300 font-medium"
                      >42.8k</span
                    >
                  </div>
                  <div class="p-1.5 flex items-center justify-between">
                    <span class="text-[11px] font-medium text-white truncate">streamer_01</span>
                    <TwitchIcon class="size-2.5 text-[#9146FF] shrink-0" />
                  </div>
                </div>

                <div
                  class="flex flex-col rounded-lg bg-[#14161a] border border-[#262930] overflow-hidden"
                >
                  <div
                    class="aspect-video w-full bg-[#0f1115] relative p-1.5 flex flex-col justify-between"
                  >
                    <span
                      class="self-start text-[8px] font-bold px-1 py-0.2 rounded bg-red-600 text-white"
                      >LIVE</span
                    >
                    <span
                      class="self-end text-[9px] px-1.5 py-0.2 rounded bg-black/80 text-gray-300 font-medium"
                      >19.4k</span
                    >
                  </div>
                  <div class="p-1.5 flex items-center justify-between">
                    <span class="text-[11px] font-medium text-white truncate">streamer_02</span>
                    <KickIcon class="size-2.5 text-[#53FC18] shrink-0" />
                  </div>
                </div>

                <div
                  class="flex flex-col rounded-lg bg-[#14161a] border border-[#262930] overflow-hidden"
                >
                  <div
                    class="aspect-video w-full bg-[#0f1115] relative p-1.5 flex flex-col justify-between"
                  >
                    <span
                      class="self-start text-[8px] font-bold px-1 py-0.2 rounded bg-red-600 text-white"
                      >LIVE</span
                    >
                    <span
                      class="self-end text-[9px] px-1.5 py-0.2 rounded bg-black/80 text-gray-300 font-medium"
                      >12.1k</span
                    >
                  </div>
                  <div class="p-1.5 flex items-center justify-between">
                    <span class="text-[11px] font-medium text-white truncate">streamer_03</span>
                    <TwitchIcon class="size-2.5 text-[#9146FF] shrink-0" />
                  </div>
                </div>
              </div>

              <!-- Caption -->
              <p class="text-[11px] text-gray-400 text-center">
                {{ $t("onboarding.step4.caption") }}
              </p>
            </div>

            <!-- STEP 5: Live Transcription (Whisper) -->
            <div
              v-else-if="currentStep === 5"
              class="flex flex-col gap-3 p-4 bg-[#181a1f] rounded-xl border border-[#262930]"
            >
              <!-- Player Subtitles Preview -->
              <div class="flex flex-col gap-2 p-3 bg-[#0f1115] border border-[#262930] rounded-lg">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="p-1.5 rounded-md bg-white/5 text-gray-300">
                      <Mic class="size-3.5" />
                    </div>
                    <span class="text-xs font-semibold text-white">{{
                      $t("onboarding.step5.title")
                    }}</span>
                  </div>
                  <span
                    class="text-[10px] font-medium px-2 py-0.5 rounded bg-white/5 text-gray-300 border border-white/10"
                  >
                    {{ $t("onboarding.step5.badgeWhisper") }}
                  </span>
                </div>

                <!-- Subtitles overlay preview -->
                <div class="flex flex-col items-center gap-1 py-1">
                  <span
                    class="text-xs text-gray-400 px-3 py-1 bg-[#14161a] border border-[#2a2d33] rounded"
                  >
                    {{ $t("onboarding.step5.captionOriginal") }}
                  </span>
                  <ArrowDown class="size-3 text-gray-500 my-0.5 shrink-0" />
                  <span
                    class="text-xs text-white px-3 py-1 bg-[#1e2127] border border-[#3a3f4b] rounded font-medium"
                  >
                    {{ $t("onboarding.step5.captionTranslation") }}
                  </span>
                </div>
              </div>

              <!-- Specs row -->
              <div
                class="flex items-center justify-between text-[11px] text-gray-400 px-1 font-medium"
              >
                <span class="flex items-center gap-1 text-gray-300">
                  <ShieldCheck class="size-3.5 text-gray-400" />
                  {{ $t("onboarding.step5.badgeLocal") }}
                </span>
                <span>{{ $t("onboarding.step5.feature1") }}</span>
                <span>{{ $t("onboarding.step5.feature2") }}</span>
              </div>
              <p class="text-[11px] text-gray-400 text-center">
                {{ $t("onboarding.step5.note") }}
              </p>
            </div>

            <!-- STEP 6: Local Recording -->
            <div
              v-else-if="currentStep === 6"
              class="flex flex-col gap-3 p-4 bg-[#181a1f] rounded-xl border border-[#262930]"
            >
              <!-- Recording Header Card -->
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
                    <span class="text-[11px] text-gray-400">1080p60 • Source Stream</span>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    class="text-[10px] font-medium px-2 py-0.5 rounded bg-white/5 text-gray-300 border border-white/10 flex items-center gap-1.5"
                  >
                    <span class="size-1.5 rounded-full bg-red-500" />
                    {{ $t("onboarding.step6.badgeRec") }}
                  </span>
                </div>
              </div>

              <!-- File destination preview -->
              <div
                class="flex items-center gap-2 px-3 py-2 bg-[#14161a] border border-[#262930] rounded-lg text-xs text-gray-400"
              >
                <Folder class="size-3.5 text-gray-400 shrink-0" />
                <span class="truncate">Videos/Multistream/recording.mp4</span>
                <span
                  class="ml-auto text-[10px] font-medium px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300 shrink-0"
                >
                  {{ $t("onboarding.step6.badgeFormat") }}
                </span>
              </div>

              <!-- Note -->
              <p class="text-[11px] text-gray-400 text-center">
                {{ $t("onboarding.step6.note") }}
              </p>
            </div>

            <!-- STEP 7: Keyboard Shortcuts -->
            <div
              v-else-if="currentStep === 7"
              class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-4 bg-[#181a1f] rounded-xl border border-[#262930]"
            >
              <!-- D Key -->
              <div
                class="flex items-center gap-3 p-2.5 bg-[#14161a] border border-[#262930] rounded-lg"
              >
                <kbd
                  class="flex items-center justify-center size-8 text-xs font-semibold text-white bg-[#1e2127] border border-[#3a3f4b] rounded-lg shadow-xs shrink-0"
                  >D</kbd
                >
                <div class="flex flex-col">
                  <span class="text-xs font-semibold text-white">{{
                    $t("onboarding.step1.title")
                  }}</span>
                  <span class="text-[11px] text-gray-400">{{ $t("onboarding.step7.add") }}</span>
                </div>
              </div>

              <!-- S Key -->
              <div
                class="flex items-center gap-3 p-2.5 bg-[#14161a] border border-[#262930] rounded-lg"
              >
                <kbd
                  class="flex items-center justify-center size-8 text-xs font-semibold text-white bg-[#1e2127] border border-[#3a3f4b] rounded-lg shadow-xs shrink-0"
                  >S</kbd
                >
                <div class="flex flex-col">
                  <span class="text-xs font-semibold text-white">{{
                    $t("onboarding.step7.screenshotTitle")
                  }}</span>
                  <span class="text-[11px] text-gray-400">{{
                    $t("onboarding.step7.screenshot")
                  }}</span>
                </div>
              </div>

              <!-- 1-9 Keys -->
              <div
                class="flex items-center gap-3 p-2.5 bg-[#14161a] border border-[#262930] rounded-lg sm:col-span-2"
              >
                <div class="flex items-center gap-1 shrink-0">
                  <kbd
                    class="flex items-center justify-center size-8 text-xs font-semibold text-white bg-[#1e2127] border border-[#3a3f4b] rounded-lg shadow-xs"
                    >1</kbd
                  >
                  <span class="text-gray-500 font-bold px-0.5">-</span>
                  <kbd
                    class="flex items-center justify-center size-8 text-xs font-semibold text-white bg-[#1e2127] border border-[#3a3f4b] rounded-lg shadow-xs"
                    >9</kbd
                  >
                </div>
                <div class="flex flex-col">
                  <span class="text-xs font-semibold text-white">{{
                    $t("onboarding.step2.title")
                  }}</span>
                  <span class="text-[11px] text-gray-400">{{
                    $t("onboarding.step7.chat", { keys: "1-9" })
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Footer Actions & Progress Indicators -->
      <div class="flex items-center justify-between pt-3 border-t border-[#262930]">
        <!-- Smooth dots indicators -->
        <div class="flex items-center gap-1.5">
          <button
            v-for="step in 7"
            v-show="step !== 5 || isSupported"
            :key="step"
            type="button"
            class="p-1 group cursor-pointer focus:outline-none"
            :aria-label="$t('onboarding.goToStep', { step })"
            @click="currentStep = step"
          >
            <div
              class="h-1.5 rounded-full transition-all duration-200"
              :class="[
                step === currentStep ? 'bg-white w-4' : 'bg-gray-600 w-1.5 group-hover:bg-gray-400',
              ]"
            />
          </button>
        </div>

        <!-- Action buttons -->
        <div class="flex items-center gap-2">
          <Button
            v-if="currentStep < 7"
            variant="ghost"
            size="sm"
            class="text-gray-400 hover:text-white hover:bg-white/5 active:scale-[0.98] transition-all text-xs"
            @click="handleSkip"
          >
            {{ $t("onboarding.skip") }}
          </Button>

          <Button
            v-if="currentStep > 1"
            variant="outline"
            size="sm"
            class="border-[#2a2d33] bg-transparent text-gray-300 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] active:scale-[0.98] transition-all text-xs"
            @click="handleBack"
          >
            <ChevronLeft class="size-3.5 mr-1" />
            {{ $t("onboarding.back") }}
          </Button>

          <Button
            size="sm"
            class="bg-white text-[#14161a] hover:bg-gray-200 active:scale-[0.98] transition-all font-medium text-xs border-transparent"
            @click="handleNext"
          >
            <template v-if="currentStep === 7">
              <Check class="size-3.5 mr-1" />
              {{ $t("onboarding.finish") }}
            </template>
            <template v-else>
              {{ $t("onboarding.next") }}
              <ChevronRight class="size-3.5 ml-1" />
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

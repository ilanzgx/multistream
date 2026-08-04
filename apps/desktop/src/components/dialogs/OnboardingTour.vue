<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TwitchIcon, KickIcon, YoutubeIcon } from "@/components/icons";
import { ChevronLeft, ChevronRight, Check, Mic, ArrowDown, Video } from "@lucide/vue";
import { useTranscription } from "@/composables/useTranscription";
import { isTauri } from "@/composables/useUpdater";
import { invoke } from "@tauri-apps/api/core";

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
const isRecordingSupported = ref(false);

onMounted(async () => {
  if (isTauri()) {
    try {
      isRecordingSupported.value = await invoke<boolean>("is_recording_supported_cmd");
    } catch {
      isRecordingSupported.value = false;
    }
  }
});

// Reset step to 1 when dialog is opened
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
  if (step === 6 && !isRecordingSupported.value) step++;
  return step;
}

function getPrevStep(from: number): number {
  let step = from - 1;
  if (step === 6 && !isRecordingSupported.value) step--;
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
      class="bg-[#14161a] border-[#2a2d33] max-w-lg md:max-w-xl outline-none"
      @pointer-down-outside="handleOutsideClick"
      @escape-key-down="handleEscapeKey"
    >
      <!-- Header -->
      <DialogHeader class="relative flex flex-col items-center text-center pb-2">
        <DialogTitle class="text-white text-xl md:text-2xl font-bold">
          {{
            currentStep === 1 ? $t("onboarding.title") : $t(`onboarding.step${currentStep}.title`)
          }}
        </DialogTitle>
        <DialogDescription v-if="currentStep === 1" class="text-gray-400 text-sm mt-1">
          {{ $t("onboarding.step1.title") }}
        </DialogDescription>
      </DialogHeader>

      <!-- Step Content Area -->
      <div class="relative py-4 h-[380px] flex flex-col justify-between">
        <Transition name="fade" mode="out-in">
          <div :key="currentStep" class="flex-1 flex flex-col gap-4">
            <!-- Step Description -->
            <p class="text-gray-300 text-sm leading-relaxed text-center px-4">
              {{ $t(`onboarding.step${currentStep}.description`, { key: "D", keys: "1-9" }) }}
            </p>

            <!-- Step Visual Graphic -->
            <div class="flex-1 flex items-center justify-center mt-2">
              <!-- STEP 1 GRAPHIC: Add Stream -->
              <div
                v-if="currentStep === 1"
                class="relative flex flex-col items-center justify-center p-6 bg-[#1f2227]/30 rounded-2xl border border-[#2a2d33]/50 overflow-hidden w-full min-h-40 group"
              >
                <!-- Tech grid pattern -->
                <div
                  class="absolute inset-0 bg-[radial-gradient(#2a2d33_1px,transparent_1px)] bg-size-[16px_16px] opacity-40"
                />

                <!-- Mock input search bar -->
                <div
                  class="relative w-full max-w-sm flex items-center gap-2.5 px-4 h-11 bg-[#14161a] border border-[#2a2d33] rounded-xl shadow-inner shadow-black/20"
                >
                  <div class="flex items-center gap-1.5 shrink-0">
                    <TwitchIcon class="size-4 text-[#9146FF]" />
                    <KickIcon class="size-4 text-[#53FC18]" />
                    <YoutubeIcon class="size-4 text-[#FF0000]" />
                  </div>
                  <span class="h-4 w-px bg-[#2a2d33]" />
                  <span class="text-xs text-gray-400 font-mono truncate select-none"
                    >twitch.tv/channel_name...</span
                  >
                  <span class="ml-auto flex items-center gap-1">
                    <kbd
                      class="px-1.5 py-0.5 text-[10px] font-semibold text-gray-400 bg-[#1f2227] border border-[#2a2d33] rounded-md shadow-sm"
                      >D</kbd
                    >
                  </span>
                </div>

                <!-- Platform items -->
                <div class="relative mt-4 flex gap-4 text-xs font-medium text-gray-400">
                  <span class="flex items-center gap-1.5"
                    ><span class="size-1.5 rounded-full bg-[#9146FF]" />Twitch</span
                  >
                  <span class="flex items-center gap-1.5"
                    ><span class="size-1.5 rounded-full bg-[#53FC18]" />Kick</span
                  >
                  <span class="flex items-center gap-1.5"
                    ><span class="size-1.5 rounded-full bg-[#FF0000]" />YouTube</span
                  >
                </div>
              </div>

              <!-- STEP 2 GRAPHIC: Select Chat -->
              <div
                v-else-if="currentStep === 2"
                class="relative flex flex-col items-center justify-center p-6 bg-[#1f2227]/30 rounded-2xl border border-[#2a2d33]/50 overflow-hidden w-full min-h-40 group"
              >
                <!-- Tech grid pattern -->
                <div
                  class="absolute inset-0 bg-[radial-gradient(#2a2d33_1px,transparent_1px)] bg-size-[16px_16px] opacity-40"
                />

                <!-- Mock selector dropdown -->
                <div class="relative w-full max-w-sm flex flex-col gap-3">
                  <div
                    class="flex items-center justify-between px-4 h-11 bg-[#14161a] border border-[#2a2d33] rounded-xl shadow-md"
                  >
                    <div class="flex items-center gap-2">
                      <span class="size-2 rounded-full bg-[#53FC18]" />
                      <span class="text-xs text-white font-medium">Ninja (Kick)</span>
                    </div>
                    <span
                      class="text-[9px] text-gray-400 uppercase tracking-wider font-semibold font-mono"
                      >{{ $t("onboarding.step2.chatActive") }}</span
                    >
                  </div>

                  <!-- Quick selector helper description -->
                  <div class="flex items-center justify-center gap-2 mt-1">
                    <span class="text-[11px] text-gray-400">{{
                      $t("onboarding.step2.pressKeys")
                    }}</span>
                    <div class="flex items-center gap-1">
                      <kbd
                        class="px-1.5 py-0.5 text-[10px] font-semibold text-gray-400 bg-[#14161a] border border-[#2a2d33] rounded-md shadow-sm"
                        >1</kbd
                      >
                      <span class="text-gray-600 text-xs">-</span>
                      <kbd
                        class="px-1.5 py-0.5 text-[10px] font-semibold text-gray-400 bg-[#14161a] border border-[#2a2d33] rounded-md shadow-sm"
                        >9</kbd
                      >
                    </div>
                    <span class="text-[11px] text-gray-400">{{
                      $t("onboarding.step2.switchImmediately")
                    }}</span>
                  </div>
                </div>
              </div>

              <!-- STEP 5 GRAPHIC: Live Transcription -->
              <div
                v-else-if="currentStep === 5"
                class="relative flex flex-col items-center justify-center p-6 bg-[#1f2227]/30 rounded-2xl border border-[#2a2d33]/50 overflow-hidden w-full min-h-40 group"
              >
                <!-- Tech grid pattern -->
                <div
                  class="absolute inset-0 bg-[radial-gradient(#2a2d33_1px,transparent_1px)] bg-size-[16px_16px] opacity-40"
                />

                <div class="relative w-full max-w-sm flex flex-col gap-2.5">
                  <!-- Settings mockup -->
                  <div
                    class="flex items-center justify-between px-3 py-2 bg-[#14161a] border border-[#2a2d33] rounded-xl shadow-md"
                  >
                    <div class="flex items-center gap-2">
                      <div class="p-1.5 bg-[#2a2d33]/40 rounded-lg">
                        <Mic class="size-3.5 text-green-400" />
                      </div>
                      <div class="flex flex-col">
                        <span class="text-[11px] text-white font-medium">{{
                          $t("onboarding.step5.title")
                        }}</span>
                        <span class="text-[9px] text-gray-400"
                          >{{ $t("settings.title") }} → {{ $t("settings.tabs.resources") }}</span
                        >
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <span
                        class="text-[8px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 uppercase tracking-wider"
                        >{{ $t("settings.transcription.modelInstalled") }}</span
                      >
                    </div>
                  </div>

                  <!-- Captions mockup on a stream -->
                  <div
                    class="relative w-full py-2.5 bg-[#0f1115] border border-[#2a2d33] rounded-lg overflow-hidden flex items-center justify-center shadow-inner"
                  >
                    <div
                      class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-60"
                    ></div>
                    <div class="relative flex flex-col items-center gap-1">
                      <p
                        class="text-[9px] sm:text-[10px] font-medium text-white px-2 py-0.5 bg-black/60 rounded text-center backdrop-blur-sm border border-white/10"
                      >
                        {{ $t("onboarding.step5.captionOriginal") }}
                      </p>
                      <ArrowDown class="size-2.5 text-white/50" />
                      <p
                        class="text-[9px] sm:text-[10px] font-medium text-white px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-center backdrop-blur-sm border border-green-500/20"
                      >
                        {{ $t("onboarding.step5.captionTranslation") }}
                      </p>
                    </div>
                  </div>

                  <!-- Feature Bullets -->
                  <ul class="flex flex-col gap-1 px-1">
                    <li class="flex items-center gap-1.5 text-[10px] text-gray-300">
                      <Check class="size-2.5 text-green-400" />
                      {{ $t("onboarding.step5.feature1") }}
                    </li>
                    <li class="flex items-center gap-1.5 text-[10px] text-gray-300">
                      <Check class="size-2.5 text-green-400" />
                      {{ $t("onboarding.step5.feature2") }}
                    </li>
                    <li class="flex items-center gap-1.5 text-[10px] text-gray-300">
                      <Check class="size-2.5 text-green-400" />
                      {{ $t("onboarding.step5.feature3") }}
                    </li>
                  </ul>

                  <!-- Note -->
                  <p class="relative text-[9px] text-gray-400 text-center">
                    {{ $t("onboarding.step5.note") }}
                  </p>
                </div>
              </div>

              <!-- STEP 6 GRAPHIC: Stream Recording -->
              <div
                v-else-if="currentStep === 6"
                class="relative flex flex-col items-center justify-center p-6 bg-[#1f2227]/30 rounded-2xl border border-[#2a2d33]/50 overflow-hidden w-full min-h-40 group"
              >
                <!-- Tech grid pattern -->
                <div
                  class="absolute inset-0 bg-[radial-gradient(#2a2d33_1px,transparent_1px)] bg-size-[16px_16px] opacity-40"
                />

                <div class="relative w-full max-w-sm flex flex-col gap-2.5">
                  <!-- Settings mockup -->
                  <div
                    class="flex items-center justify-between px-3 py-2 bg-[#14161a] border border-[#2a2d33] rounded-xl shadow-md"
                  >
                    <div class="flex items-center gap-2">
                      <div class="p-1.5 bg-[#2a2d33]/40 rounded-lg">
                        <Video class="size-3.5 text-red-400" />
                      </div>
                      <div class="flex flex-col">
                        <span class="text-[11px] text-white font-medium">{{
                          $t("onboarding.step6.title")
                        }}</span>
                        <span class="text-[9px] text-gray-400"
                          >{{ $t("settings.title") }} →
                          {{ $t("settings.recording.tabLabel") }}</span
                        >
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <span
                        class="text-[8px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wider font-mono flex items-center gap-1"
                      >
                        <span class="size-1.5 rounded-full bg-red-500" />
                        REC
                      </span>
                    </div>
                  </div>

                  <!-- Stream recording mockup card -->
                  <div
                    class="relative w-full py-2.5 bg-[#0f1115] border border-[#2a2d33] rounded-lg overflow-hidden flex items-center justify-center shadow-inner"
                  >
                    <div
                      class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-60"
                    ></div>
                    <div class="relative flex items-center gap-3 px-4">
                      <div
                        class="flex items-center gap-2 px-2 py-1 bg-black/60 rounded text-center backdrop-blur-sm border border-white/10"
                      >
                        <Video class="size-3 text-red-400" />
                        <span class="text-[10px] font-mono text-white">01:23:45</span>
                      </div>
                      <span class="text-[9px] text-gray-400 font-mono">1080p60 • .mp4</span>
                    </div>
                  </div>

                  <!-- Feature Bullets -->
                  <ul class="flex flex-col gap-1 px-1">
                    <li class="flex items-center gap-1.5 text-[10px] text-gray-300">
                      <Check class="size-2.5 text-green-400" />
                      {{ $t("onboarding.step6.feature1") }}
                    </li>
                    <li class="flex items-center gap-1.5 text-[10px] text-gray-300">
                      <Check class="size-2.5 text-green-400" />
                      {{ $t("onboarding.step6.feature2") }}
                    </li>
                    <li class="flex items-center gap-1.5 text-[10px] text-gray-300">
                      <Check class="size-2.5 text-green-400" />
                      {{ $t("onboarding.step6.feature3") }}
                    </li>
                  </ul>

                  <!-- Note -->
                  <p class="relative text-[9px] text-gray-400 text-center">
                    {{ $t("onboarding.step6.note") }}
                  </p>
                </div>
              </div>

              <!-- STEP 7 GRAPHIC: Shortcuts Grid -->
              <div
                v-else-if="currentStep === 7"
                class="relative grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full p-4 bg-[#1f2227]/30 rounded-2xl border border-[#2a2d33]/50 overflow-hidden"
              >
                <!-- Tech grid pattern -->
                <div
                  class="absolute inset-0 bg-[radial-gradient(#2a2d33_1px,transparent_1px)] bg-size-[16px_16px] opacity-40"
                />

                <!-- D key -->
                <div
                  class="relative flex items-start gap-3 p-3 bg-[#14161a] border border-[#2a2d33]/60 rounded-xl hover:border-white/10 transition-colors duration-200"
                >
                  <kbd
                    class="flex items-center justify-center size-8 text-sm font-bold text-white bg-[#1f2227] border border-[#3a3f4b] rounded-lg shadow-sm shrink-0"
                    >D</kbd
                  >
                  <div class="flex flex-col">
                    <span class="text-xs font-semibold text-white">{{
                      $t("onboarding.step1.title")
                    }}</span>
                    <span class="text-[10px] text-gray-400 mt-0.5 leading-snug">{{
                      $t("onboarding.step7.add")
                    }}</span>
                  </div>
                </div>

                <!-- S key -->
                <div
                  class="relative flex items-start gap-3 p-3 bg-[#14161a] border border-[#2a2d33]/60 rounded-xl hover:border-white/10 transition-colors duration-200"
                >
                  <kbd
                    class="flex items-center justify-center size-8 text-sm font-bold text-white bg-[#1f2227] border border-[#3a3f4b] rounded-lg shadow-sm shrink-0"
                    >S</kbd
                  >
                  <div class="flex flex-col">
                    <span class="text-xs font-semibold text-white">{{
                      $t("onboarding.step7.screenshotTitle")
                    }}</span>
                    <span class="text-[10px] text-gray-400 mt-0.5 leading-snug">{{
                      $t("onboarding.step7.screenshot")
                    }}</span>
                  </div>
                </div>

                <!-- 1-9 keys -->
                <div
                  class="relative flex items-start gap-3 p-3 bg-[#14161a] border border-[#2a2d33]/60 rounded-xl sm:col-span-2 hover:border-white/10 transition-colors duration-200"
                >
                  <div class="flex items-center gap-1 shrink-0">
                    <kbd
                      class="flex items-center justify-center size-8 text-sm font-bold text-white bg-[#1f2227] border border-[#3a3f4b] rounded-lg shadow-sm"
                      >1</kbd
                    >
                    <span class="text-gray-400 font-bold">-</span>
                    <kbd
                      class="flex items-center justify-center size-8 text-sm font-bold text-white bg-[#1f2227] border border-[#3a3f4b] rounded-lg shadow-sm"
                      >9</kbd
                    >
                  </div>
                  <div class="flex flex-col ml-1">
                    <span class="text-xs font-semibold text-white">{{
                      $t("onboarding.step2.title")
                    }}</span>
                    <span class="text-[10px] text-gray-400 mt-0.5 leading-snug">{{
                      $t("onboarding.step7.chat", { keys: "1-9" })
                    }}</span>
                  </div>
                </div>
              </div>

              <!-- STEP 3 GRAPHIC: Accounts & Authentication (Twitch & Kick) -->
              <div
                v-else-if="currentStep === 3"
                class="relative flex flex-col items-center justify-center p-6 bg-[#1f2227]/30 rounded-2xl border border-[#2a2d33]/50 overflow-hidden w-full min-h-40 group"
              >
                <!-- Tech grid pattern -->
                <div
                  class="absolute inset-0 bg-[radial-gradient(#2a2d33_1px,transparent_1px)] bg-size-[16px_16px] opacity-40"
                />

                <div class="relative w-full max-w-sm flex flex-col gap-3">
                  <!-- Accounts connection mockup card -->
                  <div
                    class="flex flex-col gap-2 p-3 bg-[#14161a] border border-[#2a2d33] rounded-xl shadow-md"
                  >
                    <!-- Twitch button mockup -->
                    <div
                      class="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#9146FF]/30 bg-[#9146FF]/10 text-xs font-medium"
                    >
                      <TwitchIcon class="size-3.5 text-[#9146FF] shrink-0" />
                      <span class="text-white font-semibold">Twitch</span>
                      <span
                        class="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#9146FF]/20 text-white border border-[#9146FF]/30"
                      >
                        Connected
                      </span>
                    </div>

                    <!-- Kick button mockup -->
                    <div
                      class="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#53FC18]/30 bg-[#53FC18]/10 text-xs font-medium"
                    >
                      <KickIcon class="size-3.5 text-[#53FC18] shrink-0" />
                      <span class="text-white font-semibold">Kick</span>
                      <span
                        class="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#53FC18]/20 text-white border border-[#53FC18]/30"
                      >
                        Connected
                      </span>
                    </div>
                  </div>

                  <!-- Feature Bullets -->
                  <ul class="flex flex-col gap-1 px-1">
                    <li class="flex items-center gap-1.5 text-[10px] text-gray-300">
                      <Check class="size-2.5 text-green-400" />
                      {{ $t("onboarding.step3.feature1") }}
                    </li>
                    <li class="flex items-center gap-1.5 text-[10px] text-gray-300">
                      <Check class="size-2.5 text-green-400" />
                      {{ $t("onboarding.step3.feature2") }}
                    </li>
                    <li class="flex items-center gap-1.5 text-[10px] text-gray-300">
                      <Check class="size-2.5 text-green-400" />
                      {{ $t("onboarding.step3.feature3") }}
                    </li>
                  </ul>
                </div>
              </div>

              <!-- STEP 4 GRAPHIC: Category Filters -->
              <div
                v-else-if="currentStep === 4"
                class="relative flex flex-col gap-4 w-full p-5 bg-[#1f2227]/30 rounded-2xl border border-[#2a2d33]/50 overflow-hidden"
              >
                <!-- Tech grid pattern -->
                <div
                  class="absolute inset-0 bg-[radial-gradient(#2a2d33_1px,transparent_1px)] bg-size-[16px_16px] opacity-40"
                />

                <!-- Mock chip row -->
                <div class="relative flex items-center gap-2 flex-wrap">
                  <span
                    class="px-3 py-1 rounded-full text-[11px] font-semibold border bg-white/10 text-white border-white/20"
                    >{{ $t("add.categoryAll") }}</span
                  >
                  <span
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border text-[#9146FF] border-[#9146FF]/30 bg-[#9146FF]/10"
                  >
                    FPS
                  </span>
                  <span
                    class="px-3 py-1 rounded-full text-[11px] font-medium border text-gray-400 border-[#2a2d33] bg-[#14161a]"
                    >Just Chatting</span
                  >
                  <span
                    class="px-3 py-1 rounded-full text-[11px] font-medium border text-gray-400 border-[#2a2d33] bg-[#14161a]"
                    >Sports</span
                  >
                </div>

                <!-- Mock card row — shows streams appearing -->
                <div class="relative flex gap-2">
                  <div
                    v-for="i in 4"
                    :key="i"
                    class="flex-1 rounded-lg bg-[#14161a] border border-[#2a2d33]/80 overflow-hidden"
                  >
                    <div class="aspect-video w-full bg-[#0f1115]">
                      <div
                        class="w-full h-full"
                        :class="i <= 2 ? 'bg-[#9146FF]/10' : 'bg-[#53FC18]/10'"
                      />
                    </div>
                    <div class="p-1.5 flex items-center justify-between gap-1">
                      <span class="text-[9px] font-bold text-white truncate">streamer_{{ i }}</span>
                      <component
                        :is="i <= 2 ? TwitchIcon : KickIcon"
                        class="size-2.5 shrink-0"
                        :style="{ color: i <= 2 ? '#9146FF' : '#53FC18' }"
                      />
                    </div>
                  </div>
                </div>

                <!-- Caption -->
                <p class="relative text-[10px] text-gray-400 text-center">
                  {{ $t("onboarding.step4.caption") }}
                </p>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Footer Buttons & Progress dot indicators -->
      <div class="flex items-center justify-between pt-4 border-t border-[#2a2d33]/50">
        <!-- Dots indicators -->
        <div class="flex items-center gap-0">
          <button
            v-for="step in 7"
            v-show="(step !== 5 || isSupported) && (step !== 6 || isRecordingSupported)"
            :key="step"
            class="p-2.5 group cursor-pointer"
            :aria-label="`Go to step ${step}`"
            @click="currentStep = step"
          >
            <div
              class="size-2 rounded-full transition-all duration-300"
              :class="[
                step === currentStep ? 'bg-white w-4' : 'bg-gray-600 group-hover:bg-gray-400',
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
            class="text-gray-400 hover:text-white hover:bg-white/5 active:scale-[0.97] transition-all"
            @click="handleSkip"
          >
            {{ $t("onboarding.skip") }}
          </Button>

          <Button
            v-if="currentStep > 1"
            variant="outline"
            size="sm"
            class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] active:scale-[0.97] transition-all"
            @click="handleBack"
          >
            <ChevronLeft class="size-4 mr-1" />
            {{ $t("onboarding.back") }}
          </Button>

          <Button
            size="sm"
            class="bg-white text-[#14161a] hover:bg-gray-200 active:scale-[0.97] transition-all font-semibold"
            @click="handleNext"
          >
            <template v-if="currentStep === 7">
              <Check class="size-4 mr-1" />
              {{ $t("onboarding.finish") }}
            </template>
            <template v-else>
              {{ $t("onboarding.next") }}
              <ChevronRight class="size-4 ml-1" />
            </template>
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateX(10px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
</style>

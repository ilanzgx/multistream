<script setup lang="ts">
import { useStreams, type Platform } from "@/composables/useStreams";
import { useFocusedStream } from "@/composables/useFocusedStream";
import { X, Heart, Maximize2, Camera, Circle, CircleStop } from "@lucide/vue";
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { useFavorites } from "@/composables/useFavorites";
import { useScreenshot } from "@/composables/useScreenshot";
import { useI18n } from "vue-i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "vue-sonner";
import { useLiveStatus } from "@/composables/useLiveStatus";
import { useElementSize } from "@vueuse/core";
import { useProfilePicture } from "@/composables/useProfilePicture";
import { useRecording } from "@/composables/useRecording";
import { usePreferences } from "@/composables/usePreferences";

const { requestRemoveStream, sessionStartTimes, now } = useStreams();
const { addFavorite, removeFavorite, favorites } = useFavorites();
const { toggleFocus, isFocused, clearFocus, focusedStreamId } = useFocusedStream();
const { captureStream, isCapturing } = useScreenshot();
const { t } = useI18n();
const { recordingEnabled, recordingQuality } = usePreferences();
const { startRecording, stopRecording, isRecording, getState } = useRecording();

const formatWatchTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    const paddedHours = String(hours).padStart(2, "0");
    return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${paddedMinutes}:${paddedSeconds}`;
};

const isHovered = ref(false);

const formattedWatchTime = computed(() => {
  if (!isHovered.value) return "";
  const start = sessionStartTimes[props.channelid];
  if (!start) return "00:00";
  const diff = Math.max(0, now.value - start);
  return formatWatchTime(diff);
});

const displayWatchTime = ref("00:00");
watch(formattedWatchTime, (newVal) => {
  if (newVal) {
    displayWatchTime.value = newVal;
  }
});

import { PLATFORMS } from "@/config/platforms";

const props = defineProps<{
  channelid: string;
  channel: string;
  platform: "twitch" | "kick" | "youtube" | "custom";
}>();

const platformConfig = computed(() => {
  return PLATFORMS[props.platform];
});

const isLoading = ref(true);
const containerRef = ref<HTMLElement>();
const isFavorite = computed(() => {
  return favorites.value.find(
    (f) => f.channel.toLowerCase() === props.channel.toLowerCase() && f.platform === props.platform
  );
});

const isStreamFocused = computed(() => isFocused(props.channelid));

// true when another stream is focused and this one is miniaturized in the sidebar
const isMiniaturized = computed(() => !!focusedStreamId.value && !isFocused(props.channelid));

const { getStatus } = useLiveStatus();
const liveStatus = computed(() => getStatus(props.channel, props.platform));
const { getProfilePicture } = useProfilePicture();
const profilePictureUrl = getProfilePicture(props.channel, props.platform);

const viewerCountDisplay = computed(() => {
  const status = liveStatus.value;
  if (!status || !status.isLive || status.viewerCount === undefined) return "offline/pending";
  return status.viewerCount.toLocaleString();
});

const embedDomain = computed(() => {
  if (props.platform === "custom") return "custom_frame";
  try {
    const url = platformConfig.value?.embedUrl;
    if (!url) return "unknown";
    return url.replace("https://", "").split("/")[0];
  } catch {
    return "unknown";
  }
});

const { width, height } = useElementSize(containerRef);

const skeletonSize = computed(() => {
  const w = width.value;
  const h = height.value;
  // Tiers adjusted for dense grid layouts (e.g. 9 streams at 1080p is ~532x330)
  if (w < 250 || h < 200) return "xs";
  if (w < 350 || h < 280) return "sm";
  if (w < 450 || h < 380) return "md";
  return "lg";
});

const hostEnvDisplay = computed(() => {
  if (typeof window === "undefined") return "unknown";
  const ua = window.navigator.userAgent;
  let os = "Unknown OS";
  let engine = "Unknown Engine";

  if (ua.includes("Windows")) {
    os = "Windows";
    engine = "WebView2";
  } else if (ua.includes("Macintosh")) {
    os = "macOS";
    engine = "WebKit";
  } else if (ua.includes("Linux")) {
    os = "Linux";
    engine = "WebKitGTK";
  }

  return `Tauri/${engine} (${os})`;
});

const appVersionDisplay = computed(() => {
  return `multistream_v${import.meta.env.VITE_APP_VERSION || "0.0.0"}`;
});

const connectionStatus = ref("RESOLVING_IFRAME");

onMounted(() => {
  setTimeout(() => {
    if (isLoading.value) {
      connectionStatus.value = "ESTABLISHING_HANDSHAKE";
    }
  }, 800);

  const iframe = containerRef.value?.querySelector("iframe");
  if (iframe) {
    iframe.addEventListener("load", () => {
      setTimeout(
        () => {
          isLoading.value = false;
        },
        props.platform === "kick" ? 3000 : 2000
      );
    });
  }

  window.addEventListener("multistream-screenshot", onScreenshotEvent);
});

onUnmounted(() => {
  window.removeEventListener("multistream-screenshot", onScreenshotEvent);
});

function onScreenshotEvent() {
  if (!isFocused(props.channelid)) return;
  handleScreenshot();
}

const handleFavoriteStream = (channel: string, platform: Platform) => {
  if (isFavorite.value) {
    removeFavorite(channel, platform);
    toast.success(`${channel} ${t("toasts.favorite.removed")}`);
  } else {
    addFavorite(channel, platform);
    toast.success(`${channel} ${t("toasts.favorite.added")}`);
  }
};

const handleFocusStream = (channelId: string) => {
  if (isFocused(channelId)) {
    clearFocus();
  } else {
    toggleFocus(channelId);
  }
};

const handleScreenshot = () => {
  if (containerRef.value) {
    captureStream(containerRef.value, props.channel, props.platform);
  }
};
</script>

<template>
  <div
    ref="containerRef"
    class="relative h-full group"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- skeleton loader with smooth fade-out -->
    <Transition name="fade">
      <div
        v-if="isLoading"
        class="absolute inset-0 w-full h-full bg-[#0f1115] flex flex-col items-center justify-center z-50"
      >
        <div :class="['w-full h-full flex flex-col', isMiniaturized ? 'p-2 gap-2' : 'p-8 gap-4']">
          <!-- video area skeleton with progress bar -->
          <div class="relative flex-1 w-full rounded-xl overflow-hidden">
            <Skeleton class="w-full h-full bg-white/5" />
            <!-- progress bar: thin animated strip at the top of the video area -->
            <div class="absolute top-0 left-0 right-0 h-0.5 overflow-hidden">
              <div
                class="h-full w-1/3 rounded-full animate-[progress_2s_ease-in-out_infinite]"
                :style="{ background: platformConfig?.color ?? '#ffffff', opacity: 0.5 }"
              />
            </div>

            <!-- centered profile picture or platform icon (subtle) -->
            <div
              class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none overflow-hidden"
              :class="
                skeletonSize === 'xs' ? 'gap-1' : skeletonSize === 'sm' ? 'gap-1.5' : 'gap-2.5'
              "
            >
              <div
                :class="[
                  'rounded-full overflow-hidden flex items-center justify-center bg-white/5 opacity-15 shrink-0',
                  skeletonSize === 'xs'
                    ? 'size-6'
                    : skeletonSize === 'sm'
                      ? 'size-10'
                      : skeletonSize === 'md'
                        ? 'size-14'
                        : 'size-20',
                ]"
              >
                <img
                  v-if="profilePictureUrl"
                  :src="profilePictureUrl"
                  :alt="props.channel"
                  class="w-full h-full object-cover transition-opacity duration-700 ease-in-out"
                />
                <component
                  :is="platformConfig?.icon"
                  v-else
                  :size="
                    skeletonSize === 'xs'
                      ? 20
                      : skeletonSize === 'sm'
                        ? 32
                        : skeletonSize === 'md'
                          ? 48
                          : 64
                  "
                  :style="{ color: platformConfig?.color }"
                  class="opacity-100 scale-[0.6]"
                />
              </div>
              <div
                class="font-medium tracking-wide animate-pulse text-white/30 text-center px-4"
                :class="
                  skeletonSize === 'xs'
                    ? 'text-[9px]'
                    : skeletonSize === 'sm'
                      ? 'text-[10px]'
                      : 'text-xs'
                "
              >
                {{ t("skeleton.loadingChannel", { channel: props.channel }) }}
              </div>
              <!-- Diagnostics Panel -->
              <div
                v-if="skeletonSize === 'lg' || skeletonSize === 'md'"
                class="font-mono text-white/30 space-y-1.5 w-full px-4 flex flex-col items-center"
                :class="skeletonSize === 'md' ? 'text-[8px]' : 'text-[10px]'"
              >
                <div class="w-fit max-w-full">
                  <div
                    class="text-[8px] text-white/15 uppercase tracking-widest border-b border-white/6 pb-1 mb-1.5 font-semibold text-left w-full"
                  >
                    [stream_diagnostics]
                  </div>

                  <div
                    class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-0.5 w-full text-left"
                  >
                    <span class="text-white/15 text-left">channel_id:</span>
                    <span class="text-white/30 truncate text-right"
                      >{{ props.platform }}_{{ props.channel }}</span
                    >

                    <span class="text-white/15 text-left">embed_src:</span>
                    <span class="text-white/30 truncate text-right">{{ embedDomain }}</span>

                    <span class="text-white/15 text-left">status:</span>
                    <span class="text-green-500/50 truncate text-right">{{
                      connectionStatus
                    }}</span>

                    <span class="text-white/15 text-left">viewers:</span>
                    <span class="text-white/30 truncate text-right">{{ viewerCountDisplay }}</span>

                    <template v-if="skeletonSize === 'lg'">
                      <span class="text-white/15 text-left">viewport:</span>
                      <span class="text-white/30 truncate text-right"
                        >{{ Math.round(width) }}x{{ Math.round(height) }}</span
                      >

                      <div class="col-span-2 border-t border-white/6 my-0.5"></div>

                      <span class="text-white/15 text-left">host_env:</span>
                      <span class="text-white/30 truncate text-right">{{ hostEnvDisplay }}</span>

                      <span class="text-white/15 text-left">build_ver:</span>
                      <span class="text-white/30 truncate text-right">{{ appVersionDisplay }}</span>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- info area skeleton -->
          <div :class="['flex items-center', isMiniaturized ? 'gap-2' : 'gap-3']">
            <!-- avatar: real platform icon instead of grey circle -->
            <div
              :class="[
                'rounded-full flex items-center justify-center shrink-0 bg-white/5',
                isMiniaturized ? 'size-6' : 'size-12',
              ]"
            >
              <component
                :is="platformConfig?.icon"
                :size="isMiniaturized ? 14 : 26"
                :style="{ color: platformConfig?.color }"
                class="opacity-40"
              />
            </div>
            <div v-if="!isMiniaturized" class="space-y-2">
              <!-- real channel name, muted -->
              <p class="h-4 text-sm font-medium text-white/30 leading-none tracking-wide">
                {{ props.channel }}
              </p>
              <!-- category skeleton or real category -->
              <Skeleton v-if="!liveStatus?.category" class="h-3 w-24 bg-white/5" />
              <p v-else class="h-3 text-xs text-white/20 leading-none truncate max-w-[120px]">
                {{ liveStatus.category }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- stream controls - appears on hover -->
    <div
      :class="[
        'absolute z-10 flex flex-col opacity-0 translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 pointer-events-none',
        isMiniaturized ? 'top-1 right-1 gap-1' : 'top-2 right-2 gap-2',
      ]"
    >
      <button
        :data-testid="`remove-stream-${channel}`"
        :class="[
          'pointer-events-auto flex items-center justify-center rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-white/80 hover:bg-red-500/80 hover:text-white hover:border-red-400/50 transition-all duration-200 hover:scale-110 cursor-pointer',
          isMiniaturized ? 'size-5' : 'size-8',
        ]"
        @click="requestRemoveStream(channelid)"
      >
        <X :class="isMiniaturized ? 'size-3' : 'size-4'" />
      </button>
      <button
        :class="[
          'pointer-events-auto flex items-center justify-center rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-white/80 hover:bg-pink-500/80 hover:text-white hover:border-pink-400/50 transition-all duration-200 hover:scale-110 cursor-pointer',
          isMiniaturized ? 'size-5' : 'size-8',
        ]"
        @click="handleFavoriteStream(channel, platform)"
      >
        <Heart
          :class="[isMiniaturized ? 'size-3' : 'size-4', 'transition-colors']"
          :fill="isFavorite ? 'currentColor' : 'none'"
        />
      </button>
      <!-- screenshot button -->
      <button
        :disabled="isCapturing"
        :class="[
          'pointer-events-auto flex items-center justify-center rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-white/80 hover:bg-blue-500/80 hover:text-white hover:border-blue-400/50 transition-all duration-200 hover:scale-110 cursor-pointer',
          isMiniaturized ? 'size-5' : 'size-8',
          isCapturing ? 'opacity-50 pointer-events-none' : '',
        ]"
        @click="handleScreenshot"
      >
        <Camera :class="isMiniaturized ? 'size-3' : 'size-4'" />
      </button>
      <!-- record button -->
      <template v-if="recordingEnabled && props.platform !== 'custom'">
        <button
          :data-testid="`record-stream-${props.channel}`"
          :class="[
            'relative pointer-events-auto flex flex-col items-center justify-center rounded-lg backdrop-blur-sm border transition-all duration-200 hover:scale-110 cursor-pointer',
            isMiniaturized ? 'size-5' : 'size-8',
            isRecording(props.channelid)
              ? 'bg-red-500/80 text-white border-red-400/50 hover:bg-red-600/80'
              : 'bg-black/60 text-white/80 border-white/10 hover:bg-red-500/80 hover:text-white hover:border-red-400/50',
          ]"
          @click="
            isRecording(props.channelid)
              ? stopRecording(props.channelid)
              : startRecording(
                  { id: props.channelid, channel: props.channel, platform: props.platform },
                  recordingQuality || 'best'
                )
          "
        >
          <CircleStop
            v-if="isRecording(props.channelid)"
            :class="isMiniaturized ? 'size-3' : 'size-4'"
          />
          <Circle v-else :class="isMiniaturized ? 'size-3' : 'size-4'" />
        </button>
      </template>
      <!-- focus mode button -->
      <button
        :class="[
          'pointer-events-auto flex items-center justify-center rounded-lg backdrop-blur-sm border transition-all duration-200 hover:scale-110 cursor-pointer',
          isMiniaturized ? 'size-5' : 'size-8',
          isStreamFocused
            ? 'bg-yellow-500/80 text-white border-yellow-400/50 hover:bg-yellow-600/80'
            : 'bg-black/60 text-white/80 border-white/10 hover:bg-yellow-500/80 hover:text-white hover:border-yellow-400/50',
        ]"
        @click="handleFocusStream(channelid)"
      >
        <Maximize2 :class="isMiniaturized ? 'size-3' : 'size-4'" />
      </button>
    </div>

    <!-- watch timer bottom overlay bar - appears on hover -->
    <div
      :class="[
        'absolute bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[9px] sm:text-[10px] text-white/70 pointer-events-none opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 z-10 shadow-lg flex items-center gap-2',
        isMiniaturized ? 'scale-90 bottom-1' : '',
      ]"
    >
      <span
        v-if="getState(props.channelid)?.status === 'recording'"
        class="flex items-center gap-1 text-red-400 font-medium tabular-nums"
      >
        <Circle class="size-2 animate-pulse fill-red-400 text-red-400" />
        {{ formatWatchTime((getState(props.channelid)?.elapsed ?? 0) * 1000) }}
      </span>
      <div
        v-if="getState(props.channelid)?.status === 'recording'"
        class="w-px h-3 bg-white/10"
      ></div>
      <span class="font-medium tracking-wide tabular-nums">
        {{ t("stream.watching") }}: {{ displayWatchTime }}
      </span>
    </div>

    <slot />
  </div>
</template>

<style scoped>
:slotted(iframe) {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: none;
  /* Prevent black screen rendering bugs in Chromium/WebView2 when overlays/dialogs are open */
  transform: translateZ(0);
  will-change: transform;
  backface-visibility: hidden;
  color-scheme: normal;
}

/* Skeleton fade-out */
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-leave-to {
  opacity: 0;
}
</style>

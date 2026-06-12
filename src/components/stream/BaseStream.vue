<script setup lang="ts">
import { useStreams, type Platform } from "@/composables/useStreams";
import { useFocusedStream } from "@/composables/useFocusedStream";
import { X, Heart, Maximize2, Camera } from "lucide-vue-next";
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { useFavorites } from "@/composables/useFavorites";
import { useScreenshot } from "@/composables/useScreenshot";
import { useI18n } from "vue-i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "vue-sonner";
import { useLiveStatus } from "@/composables/useLiveStatus";
import { useElementSize } from "@vueuse/core";

const { requestRemoveStream, sessionStartTimes, now } = useStreams();
const { addFavorite, removeFavorite, favorites } = useFavorites();
const { toggleFocus, isFocused, clearFocus, focusedStreamId } = useFocusedStream();
const { captureStream, isCapturing } = useScreenshot();
const { t } = useI18n();

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

const viewerCountDisplay = computed(() => {
  const status = liveStatus.value;
  if (!status || !status.isLive || status.viewerCount === undefined) return "offline/pending";
  const num = status.viewerCount;
  const hex = num.toString(16).toUpperCase();
  return `${num.toLocaleString()} (0x${hex})`;
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
      setTimeout(() => {
        isLoading.value = false;
      }, 2000);
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
          <div class="relative flex-1 w-full">
            <Skeleton class="w-full h-full rounded-xl bg-white/5" />
            <!-- progress bar: thin animated strip at the top of the video area -->
            <div class="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl overflow-hidden">
              <div
                class="h-full w-1/3 rounded-full animate-[progress_2s_ease-in-out_infinite]"
                :style="{ background: platformConfig?.color ?? '#ffffff', opacity: 0.5 }"
              />
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
              <!-- category still a skeleton -->
              <Skeleton class="h-3 w-24 bg-white/5" />
            </div>
          </div>
        </div>

        <!-- centered platform icon (subtle) -->
        <div
          class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2.5"
        >
          <component
            :is="platformConfig?.icon"
            :size="isMiniaturized ? 32 : 80"
            :style="{ color: platformConfig?.color }"
            class="opacity-10"
          />
          <div
            class="font-medium tracking-wide animate-pulse text-white/20 text-center"
            :class="[
              isMiniaturized ? 'text-[9px] max-w-17.5 sm:max-w-22.5 truncate px-1' : 'text-xs',
            ]"
          >
            {{ t("skeleton.loadingChannel", { channel: props.channel }) }}
          </div>
          <!-- Diagnostics Panel -->
          <div
            v-if="!isMiniaturized"
            class="mt-4 font-mono text-[10px] text-white/30 text-left space-y-1 min-w-53.75"
          >
            <div
              class="text-[9px] text-white/15 uppercase tracking-widest border-b border-white/6 pb-1 mb-1 font-semibold"
            >
              [stream_diagnostics]
            </div>
            <div class="flex justify-between gap-4">
              <span class="text-white/15">channel_id:</span>
              <span class="text-white/30 truncate max-w-31.25"
                >{{ props.platform }}_{{ props.channel }}</span
              >
            </div>
            <div class="flex justify-between gap-4">
              <span class="text-white/15">embed_src:</span>
              <span class="text-white/30 truncate max-w-31.25">{{ embedDomain }}</span>
            </div>
            <div class="flex justify-between gap-4">
              <span class="text-white/15">status:</span>
              <span class="text-green-400/30">{{ connectionStatus }}</span>
            </div>
            <div class="flex justify-between gap-4">
              <span class="text-white/15">viewers:</span>
              <span class="text-white/30">{{ viewerCountDisplay }}</span>
            </div>
            <div class="flex justify-between gap-4">
              <span class="text-white/15">viewport:</span>
              <span class="text-white/30">{{ Math.round(width) }}x{{ Math.round(height) }}</span>
            </div>
            <div class="flex justify-between gap-4 border-t border-white/6 pt-1 mt-1">
              <span class="text-white/15">host_env:</span>
              <span class="text-white/30">{{ hostEnvDisplay }}</span>
            </div>
            <div class="flex justify-between gap-4">
              <span class="text-white/15">build_ver:</span>
              <span class="text-white/30">{{ appVersionDisplay }}</span>
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
        'absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] sm:text-xs text-white/90 pointer-events-none opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 z-10 shadow-lg',
        isMiniaturized ? 'scale-90 bottom-1' : '',
      ]"
    >
      <span class="font-medium tracking-wide"
        >{{ t("stream.watching") }}: {{ displayWatchTime }}</span
      >
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

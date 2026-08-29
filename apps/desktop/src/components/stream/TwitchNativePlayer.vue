<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from "vue";
import { onClickOutside } from "@vueuse/core";
import Hls from "hls.js";
import { invoke } from "@tauri-apps/api/core";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "vue-i18n";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  Users,
  VideoOff,
  Loader2,
} from "@lucide/vue";
import { TwitchIcon } from "@/components/icons";

const props = defineProps<{
  channel: string;
  title?: string;
  viewerCount?: number;
  avatarUrl?: string | null;
  isFocused?: boolean;
}>();

const { t } = useI18n();

const isCompact = computed(() => !props.isFocused && !isFullscreen.value);
const videoRef = ref<HTMLVideoElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const isLoading = ref(true);
const isBuffering = ref(false);
const hasError = ref(false);
const isOffline = ref(false);
const errorDetails = ref("");
let hls: Hls | null = null;
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let isDisposed = false;
const MAX_RETRIES = 3;

const isPlaying = ref(true);
const isMuted = ref(true);
const volume = ref([50]);
const isFullscreen = ref(false);
const showControls = ref(true);
const qualityMenuOpen = ref(false);
const qualityMenuRef = ref<HTMLDivElement | null>(null);

onClickOutside(qualityMenuRef, () => {
  qualityMenuOpen.value = false;
});
const availableLevels = ref<{ height: number; label: string }[]>([]);
const currentLevelIndex = ref(-1);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const volumeIcon = computed(() => {
  const v = volume.value[0] ?? 0;
  if (isMuted.value || v === 0) return VolumeX;
  if (v < 50) return Volume1;
  return Volume2;
});

const currentQualityLabel = computed(() => {
  if (currentLevelIndex.value === -1) return t("nativePlayer.quality.auto");
  return availableLevels.value[currentLevelIndex.value]?.label || t("nativePlayer.quality.auto");
});

function resetHideTimer() {
  if (hideTimer) clearTimeout(hideTimer);
  showControls.value = true;
  hideTimer = setTimeout(() => {
    if (!qualityMenuOpen.value) showControls.value = false;
  }, 2500);
}

function onMouseMove() {
  resetHideTimer();
}

function onMouseLeave() {
  if (hideTimer) clearTimeout(hideTimer);
  if (!qualityMenuOpen.value) showControls.value = false;
}

function togglePlay() {
  const video = videoRef.value;
  if (!video) return;
  if (video.paused) {
    if (hls && hls.liveSyncPosition) {
      video.currentTime = hls.liveSyncPosition;
    }
    video.play().catch(() => {});
  } else {
    video.pause();
  }
}

function toggleMute() {
  if (!videoRef.value) return;
  isMuted.value = !isMuted.value;
  videoRef.value.muted = isMuted.value;
}

function onVolumeChange(val: number[] | undefined) {
  if (!val) return;
  volume.value = val;
  if (!videoRef.value) return;
  const v = val[0] ?? 0;
  videoRef.value.volume = v / 100;
  if (v > 0 && isMuted.value) {
    isMuted.value = false;
    videoRef.value.muted = false;
  }
  if (v === 0) {
    isMuted.value = true;
    videoRef.value.muted = true;
  }
}

function snapToLive() {
  const video = videoRef.value;
  if (!video) return;
  if (hls && hls.liveSyncPosition) {
    video.currentTime = hls.liveSyncPosition;
  } else if (video.seekable && video.seekable.length > 0) {
    video.currentTime = video.seekable.end(video.seekable.length - 1);
  }
  if (video.paused) {
    video.play().catch(() => {});
  }
}

function setQuality(index: number) {
  if (!hls) return;
  hls.currentLevel = index;
  currentLevelIndex.value = index;
  qualityMenuOpen.value = false;
}

function toggleQualityMenu() {
  qualityMenuOpen.value = !qualityMenuOpen.value;
  if (qualityMenuOpen.value) {
    if (hideTimer) clearTimeout(hideTimer);
  } else {
    resetHideTimer();
  }
}

async function toggleFullscreen() {
  if (!containerRef.value) return;
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    isFullscreen.value = false;
  } else {
    await containerRef.value.requestFullscreen();
    isFullscreen.value = true;
  }
}

function onFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === containerRef.value;
}

function buildLevelLabel(level: { height: number; attrs?: Record<string, string> }) {
  if (!level.height) return t("nativePlayer.quality.audio");
  const fps = level.attrs?.["FRAME-RATE"];
  const fpsNum = fps ? Math.round(parseFloat(fps)) : null;
  const suffix = fpsNum && fpsNum > 30 ? fpsNum.toString() : "";
  return `${level.height}p${suffix}`;
}

function scheduleRetry() {
  if (isDisposed) return;
  if (retryTimer) {
    clearTimeout(retryTimer);
  }
  retryCount++;
  const delay = Math.min(1000 * 2 ** retryCount, 10000);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    loadStream();
  }, delay);
}

let currentLoadId = 0;

async function loadStream() {
  if (isDisposed) return;
  const loadId = ++currentLoadId;

  isLoading.value = true;
  isBuffering.value = false;
  hasError.value = false;
  isOffline.value = false;
  errorDetails.value = "";

  try {
    const url = await invoke<string>("twitch_get_hls_url", { channel: props.channel });
    if (isDisposed || currentLoadId !== loadId) return;

    await nextTick();
    if (!videoRef.value) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (isDisposed || currentLoadId !== loadId) return;

    if (!videoRef.value) {
      hasError.value = true;
      errorDetails.value = t("settings.nativePlayer.videoRefError");
      isLoading.value = false;
      return;
    }

    const v = volume.value[0] ?? 50;
    videoRef.value.volume = v / 100;
    videoRef.value.muted = isMuted.value || v === 0;

    if (hls) {
      hls.destroy();
      hls = null;
    }

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        if (isDisposed) return;
        isLoading.value = false;
        retryCount = 0;

        availableLevels.value = data.levels.map((l) => ({
          height: l.height,
          label: buildLevelLabel(l),
        }));
        currentLevelIndex.value = hls!.currentLevel;

        videoRef.value?.play().catch(() => {});
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        if (currentLevelIndex.value === -1) return;
        currentLevelIndex.value = data.level;
      });

      let networkRetryCount = 0;

      // Reset network retry counter on successful fragment load
      hls.on(Hls.Events.FRAG_LOADED, () => {
        networkRetryCount = 0;
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (isDisposed) return;

        if (!data.fatal) return;

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (data.response && data.response.code === 404) {
            isOffline.value = true;
            isLoading.value = false;
            hasError.value = false;
            return;
          }

          // If token expired (403), immediately get a fresh URL instead of startLoad()
          if (data.response && data.response.code === 403) {
            if (retryCount < MAX_RETRIES) {
              scheduleRetry();
            } else {
              hasError.value = true;
              errorDetails.value = t("nativePlayer.errors.tokenExpired");
              isLoading.value = false;
            }
            return;
          }

          if (networkRetryCount < 3) {
            networkRetryCount++;
            hls?.startLoad();
            return;
          }
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
          return;
        }

        // If we reach here, it's a fatal error that Hls.js can't recover from natively.
        // Pragmatic fix: fetch a new URL instead of freezing/dying.
        if (retryCount < MAX_RETRIES) {
          scheduleRetry();
        } else {
          hasError.value = true;
          errorDetails.value = t("nativePlayer.errors.hlsError", {
            type: data.type,
            details: data.details,
          });
          isLoading.value = false;
        }
      });

      hls.loadSource(url);
      hls.attachMedia(videoRef.value);
    } else if (videoRef.value.canPlayType("application/vnd.apple.mpegurl")) {
      videoRef.value.src = url;
      videoRef.value.addEventListener(
        "loadedmetadata",
        () => {
          if (isDisposed) return;
          isLoading.value = false;
          videoRef.value?.play().catch(() => {});
        },
        { once: true }
      );
      videoRef.value.addEventListener(
        "error",
        (_err) => {
          if (isDisposed) return;
          if (retryCount < MAX_RETRIES) {
            scheduleRetry();
          } else {
            hasError.value = true;
            errorDetails.value = t("nativePlayer.errors.playbackError");
            isLoading.value = false;
          }
        },
        { once: true }
      );
    } else {
      hasError.value = true;
      errorDetails.value = t("settings.nativePlayer.notSupportedError");
      isLoading.value = false;
    }
  } catch (err) {
    if (isDisposed || currentLoadId !== loadId) return;
    console.error("[TwitchNativePlayer] Failed to load stream:", err);

    const errStr = String(err).toLowerCase();
    if (errStr.includes("offline")) {
      isOffline.value = true;
      isLoading.value = false;
      hasError.value = false;
      return;
    }

    errorDetails.value = String(err);
    if (retryCount < MAX_RETRIES) {
      scheduleRetry();
    } else {
      hasError.value = true;
      isLoading.value = false;
    }
  }
}

watch(qualityMenuOpen, (open) => {
  if (!open) {
    resetHideTimer();
  }
});

let clickCount = 0;
let clickTimer: ReturnType<typeof setTimeout> | null = null;

function handleVideoClick() {
  clickCount++;
  if (clickCount === 1) {
    clickTimer = setTimeout(() => {
      clickCount = 0;
      togglePlay();
    }, 250);
  } else if (clickCount === 2) {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    clickCount = 0;
    toggleFullscreen();
  }
}

let stallWatchdog: ReturnType<typeof setTimeout> | null = null;
let offlinePollingTimer: ReturnType<typeof setInterval> | null = null;

function clearWatchdog() {
  if (stallWatchdog) {
    clearTimeout(stallWatchdog);
    stallWatchdog = null;
  }
}

function startOfflinePolling() {
  if (offlinePollingTimer) return;
  // Poll silently every 30 seconds to see if stream is back online
  offlinePollingTimer = setInterval(async () => {
    if (isDisposed) return;
    try {
      const url = await invoke<string>("twitch_get_hls_url", { channel: props.channel });
      if (url && !isDisposed) {
        stopOfflinePolling();
        loadStream();
      }
    } catch {
      // Still offline
    }
  }, 30000);
}

function stopOfflinePolling() {
  if (offlinePollingTimer) {
    clearInterval(offlinePollingTimer);
    offlinePollingTimer = null;
  }
}

watch(isOffline, (offline) => {
  if (offline) {
    startOfflinePolling();
  } else {
    stopOfflinePolling();
  }
});

function onVideoPlaying() {
  isPlaying.value = true;
  isBuffering.value = false;
  clearWatchdog();
}

function onVideoPaused() {
  isPlaying.value = false;
  isBuffering.value = false;
  clearWatchdog();
}

function onVideoWaiting() {
  if (!isPlaying.value) return;
  isBuffering.value = true;
  clearWatchdog();
  // Auto-recover if stuck in buffering for 4 seconds
  stallWatchdog = setTimeout(() => {
    if (isBuffering.value && isPlaying.value && videoRef.value) {
      // Simulate manual pause
      videoRef.value.pause();
      // Simulate quality switch to force buffer flush
      if (hls) {
        hls.nextLoadLevel = hls.currentLevel;
      }
      // Resume playback at live edge
      snapToLive();
    }
  }, 4000);
}

function onVideoEnded() {
  isOffline.value = true;
  isLoading.value = false;
  isBuffering.value = false;
  hasError.value = false;
  clearWatchdog();
}

onMounted(() => {
  loadStream();
  document.addEventListener("fullscreenchange", onFullscreenChange);
});

onBeforeUnmount(() => {
  isDisposed = true;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }
  clearWatchdog();
  stopOfflinePolling();
  if (hls) {
    hls.destroy();
    hls = null;
  }
  document.removeEventListener("fullscreenchange", onFullscreenChange);
});
</script>

<template>
  <div
    ref="containerRef"
    class="relative w-full h-full bg-black group select-none"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
    @click.self="togglePlay"
  >
    <Skeleton v-if="isLoading" class="absolute inset-0 bg-[#1e2127]" />
    <div
      v-if="hasError"
      class="absolute inset-0 flex flex-col items-center justify-center bg-[#0f1115] p-4 text-center"
    >
      <p class="text-red-400 font-medium text-sm mb-1">
        {{ t("settings.nativePlayer.loadError") }}
      </p>
      <p
        v-if="errorDetails"
        class="text-gray-400 text-xs font-mono max-w-xs break-words opacity-80"
      >
        {{ errorDetails }}
      </p>
    </div>

    <!-- Offline Overlay -->
    <div
      v-if="isOffline"
      class="absolute inset-0 flex flex-col items-center justify-center bg-[#0f1115]/90 p-4 text-center z-10 backdrop-blur-sm"
    >
      <div class="relative mb-3">
        <img
          v-if="props.avatarUrl"
          :src="props.avatarUrl"
          :alt="props.channel"
          class="size-16 rounded-full object-cover ring-4 ring-white/5"
        />
        <div
          v-else
          class="size-16 rounded-full bg-white/5 flex items-center justify-center ring-4 ring-white/5"
        >
          <VideoOff class="size-8 text-gray-500" />
        </div>

        <!-- Twitch badge -->
        <div
          class="absolute -bottom-1 -right-1 bg-[#9146FF] rounded-full p-1 border-[2.5px] border-[#0f1115] flex items-center justify-center shadow-md"
        >
          <TwitchIcon class="size-3 text-white" />
        </div>
      </div>
      <p class="text-white font-semibold text-lg tracking-wide mb-1">
        {{ props.channel }}
      </p>
      <p class="text-gray-400 text-sm font-medium">
        {{ t("nativePlayer.offline.title") }}
      </p>
    </div>

    <div
      v-if="isBuffering && !isLoading && !hasError && !isOffline"
      class="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
    >
      <Loader2 class="size-8 text-white animate-spin opacity-75" />
    </div>

    <video
      ref="videoRef"
      class="w-full h-full object-contain cursor-pointer"
      :class="{ 'opacity-0': isLoading }"
      autoplay
      playsinline
      :muted="isMuted"
      @play="onVideoPlaying"
      @playing="onVideoPlaying"
      @pause="onVideoPaused"
      @waiting="onVideoWaiting"
      @ended="onVideoEnded"
      @click="handleVideoClick"
    />

    <!-- HUD Overlay -->
    <Transition name="hud-fade">
      <div
        v-show="showControls && !isLoading && !hasError && !isOffline"
        class="absolute inset-0 pointer-events-none"
      >
        <!-- Top gradient + channel info -->
        <div
          class="absolute top-0 left-0 right-0 bg-linear-to-b from-black/70 to-transparent px-3 pt-3 pb-8"
        >
          <div class="flex items-center gap-2.5">
            <img
              v-if="props.avatarUrl"
              :src="props.avatarUrl"
              :alt="props.channel"
              class="size-8 rounded-full object-cover ring-1 ring-white/10 shrink-0"
            />
            <div class="min-w-0 flex flex-col justify-center">
              <div class="flex items-center gap-2">
                <p class="text-white text-sm font-semibold leading-tight truncate">
                  {{ props.channel }}
                </p>
                <span
                  v-if="props.viewerCount !== undefined"
                  class="flex items-center gap-1 text-[10px] text-rose-400 font-bold bg-black/40 px-1.5 py-0.5 rounded-md"
                >
                  <Users class="size-3" />
                  {{ props.viewerCount.toLocaleString() }}
                </span>
              </div>
              <p
                v-if="props.title"
                class="text-gray-400 text-xs leading-tight truncate max-w-75 mt-0.5"
              >
                {{ props.title }}
              </p>
            </div>
          </div>
        </div>

        <!-- Bottom gradient + controls -->
        <div
          class="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/70 to-transparent pt-8 pb-2 pointer-events-auto"
          :class="isCompact ? 'px-2' : 'px-3'"
        >
          <div class="flex items-center" :class="isCompact ? 'gap-1.5' : 'gap-2'">
            <!-- Play/Pause -->
            <button
              class="text-white/90 hover:text-white transition-colors cursor-pointer p-1"
              :aria-label="isPlaying ? t('common.pause') : t('common.play')"
              @click="togglePlay"
            >
              <Pause v-if="isPlaying" :class="isCompact ? 'size-4.5' : 'size-5'" />
              <Play v-else :class="isCompact ? 'size-4.5' : 'size-5'" />
            </button>

            <!-- Volume -->
            <button
              class="text-white/90 hover:text-white transition-colors cursor-pointer p-1"
              :aria-label="isMuted ? t('common.unmute') : t('common.mute')"
              @click="toggleMute"
            >
              <component :is="volumeIcon" :class="isCompact ? 'size-4.5' : 'size-5'" />
            </button>
            <Slider
              :model-value="isMuted ? [0] : volume"
              :max="100"
              :step="1"
              :class="isCompact ? 'w-12' : 'w-20'"
              :aria-label="t('common.volume')"
              @update:model-value="onVolumeChange"
            />

            <!-- LIVE badge -->
            <button
              class="flex items-center rounded font-bold uppercase tracking-wider cursor-pointer ml-auto transition-colors"
              :class="[
                isPlaying
                  ? 'text-white bg-red-600/80 hover:bg-red-500'
                  : 'text-gray-400 bg-white/10 hover:bg-white/20',
                isCompact ? 'gap-0.5 px-1 py-0.5 text-[9px]' : 'gap-1 px-1.5 py-0.5 text-[10px]',
              ]"
              @click="snapToLive"
            >
              <span class="size-1.5 rounded-full" :class="isPlaying ? 'bg-white' : 'bg-gray-500'" />
              {{ t("nativePlayer.live") }}
            </button>

            <!-- Quality -->
            <div ref="qualityMenuRef" class="relative">
              <button
                class="text-white/90 hover:text-white transition-colors cursor-pointer p-1 flex items-center gap-1"
                :aria-label="t('common.settings')"
                @click="toggleQualityMenu"
              >
                <Settings class="size-4" />
                <span class="text-gray-300" :class="isCompact ? 'text-[10px]' : 'text-xs'">{{
                  currentQualityLabel
                }}</span>
              </button>
              <Transition name="hud-fade">
                <div
                  v-if="qualityMenuOpen"
                  class="absolute bottom-full right-0 mb-2 bg-[#1a1c20]/95 backdrop-blur-md border border-white/10 rounded-lg py-1 min-w-30 shadow-xl"
                >
                  <button
                    class="w-full text-left px-3 py-1.5 text-xs cursor-pointer transition-colors"
                    :class="
                      currentLevelIndex === -1
                        ? 'text-white bg-white/10'
                        : 'text-gray-300 hover:bg-white/5 hover:text-white'
                    "
                    @click="setQuality(-1)"
                  >
                    {{ t("nativePlayer.quality.auto") }}
                  </button>
                  <button
                    v-for="(level, idx) in availableLevels"
                    :key="idx"
                    class="w-full text-left px-3 py-1.5 text-xs cursor-pointer transition-colors"
                    :class="
                      currentLevelIndex === idx
                        ? 'text-white bg-white/10'
                        : 'text-gray-300 hover:bg-white/5 hover:text-white'
                    "
                    @click="setQuality(idx)"
                  >
                    {{ level.label }}
                  </button>
                </div>
              </Transition>
            </div>

            <!-- Fullscreen -->
            <button
              class="text-white/90 hover:text-white transition-colors cursor-pointer p-1"
              :aria-label="isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen')"
              @click="toggleFullscreen"
            >
              <Minimize v-if="isFullscreen" :class="isCompact ? 'size-4.5' : 'size-5'" />
              <Maximize v-else :class="isCompact ? 'size-4.5' : 'size-5'" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.hud-fade-enter-active,
.hud-fade-leave-active {
  transition: opacity 0.25s ease;
}
.hud-fade-enter-from,
.hud-fade-leave-to {
  opacity: 0;
}
</style>

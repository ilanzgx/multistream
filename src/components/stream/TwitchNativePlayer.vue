<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import Hls from "hls.js";
import { invoke } from "@tauri-apps/api/core";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "vue-i18n";

const props = defineProps<{ channel: string }>();

const { t } = useI18n();
const videoRef = ref<HTMLVideoElement | null>(null);
const isLoading = ref(true);
const hasError = ref(false);
const errorDetails = ref("");
let hls: Hls | null = null;
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let isDisposed = false;
const MAX_RETRIES = 3;

function scheduleRetry() {
  if (isDisposed) return;
  retryCount++;
  const delay = Math.min(1000 * 2 ** retryCount, 10000);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    loadStream();
  }, delay);
}

async function loadStream() {
  if (isDisposed) return;
  isLoading.value = true;
  hasError.value = false;
  errorDetails.value = "";

  try {
    const url = await invoke<string>("twitch_get_hls_url", { channel: props.channel });
    if (isDisposed) return;

    await nextTick();
    if (!videoRef.value) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (isDisposed) return;

    if (!videoRef.value) {
      hasError.value = true;
      errorDetails.value = t("settings.nativePlayer.videoRefError");
      isLoading.value = false;
      return;
    }

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

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (isDisposed) return;
        isLoading.value = false;
        retryCount = 0;
        videoRef.value?.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || isDisposed) return;

        if (retryCount < MAX_RETRIES) {
          scheduleRetry();
        } else {
          hasError.value = true;
          errorDetails.value = `HLS Error (${data.type}: ${data.details})`;
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
    } else {
      hasError.value = true;
      errorDetails.value = t("settings.nativePlayer.notSupportedError");
      isLoading.value = false;
    }
  } catch (err) {
    if (isDisposed) return;
    console.error("[TwitchNativePlayer] Failed to load stream:", err);
    errorDetails.value = String(err);
    if (retryCount < MAX_RETRIES) {
      scheduleRetry();
    } else {
      hasError.value = true;
      isLoading.value = false;
    }
  }
}

onMounted(() => loadStream());

onBeforeUnmount(() => {
  isDisposed = true;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (hls) {
    hls.destroy();
    hls = null;
  }
});
</script>

<template>
  <div class="relative w-full h-full bg-black">
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
        class="text-gray-400 text-xs font-mono max-w-xs wrap-break-word opacity-80"
      >
        {{ errorDetails }}
      </p>
    </div>
    <video
      ref="videoRef"
      class="w-full h-full object-contain"
      :class="{ 'opacity-0': isLoading }"
      controls
      autoplay
      muted
    />
  </div>
</template>

import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { isTauri } from "./useUpdater";
import { createSharedComposable } from "@vueuse/core";

let hasWarnedCodecs = false;

const _useMediaCodecs = () => {
  const { t } = useI18n();

  const checkVideoCodecs = () => {
    if (hasWarnedCodecs) return;

    // Only run the check inside Tauri. Browsers handle this natively.
    if (!isTauri()) return;

    // We strictly want to target Linux. macOS and Windows have native H.264 decoders.
    const isLinux = navigator.userAgent.toLowerCase().includes("linux");
    if (!isLinux) return;

    const video = document.createElement("video");
    const canPlay = video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');

    // If canPlay is empty string, the system definitely does NOT support this codec.
    if (canPlay === "") {
      hasWarnedCodecs = true;
      toast.warning(t("toasts.codecs.missing"), {
        duration: 8000,
      });
    }
  };

  return { checkVideoCodecs };
};

export const useMediaCodecs = createSharedComposable(_useMediaCodecs);

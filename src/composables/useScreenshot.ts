import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { isTauri } from "./useLiveStatus";

/**
 * @brief Composable for capturing screenshots of stream video frames.
 *
 * Uses an injection script (screenshot_capture.js) that runs inside each
 * stream iframe. When a capture is requested, it sends a postMessage to the
 * target iframe, which draws the current video frame onto a canvas and
 * returns the base64 data URL.
 *
 * On Tauri, the image is saved to the user's Pictures/Multistream folder.
 * On web, it triggers a browser download.
 */
export function useScreenshot() {
  const { t } = useI18n();
  const isCapturing = ref(false);

  /**
   * @brief Capture a screenshot of the video inside a stream element.
   *
   * Finds the iframe within the given container element, sends a capture
   * request via postMessage, waits for the injected script to respond
   * with the base64 image data, and saves or downloads the result.
   *
   * @param streamElement The DOM element containing the stream iframe
   * @param channel The channel name (used in filename)
   * @param platform The platform name (used in filename)
   */
  const captureStream = async (
    streamElement: HTMLElement,
    channel: string,
    platform: string,
  ): Promise<void> => {
    if (isCapturing.value) return;
    isCapturing.value = true;

    try {
      const iframe = streamElement.querySelector("iframe");
      if (!iframe || !iframe.contentWindow) {
        toast.error(t("toasts.screenshot.noStream"));
        return;
      }

      const requestId = crypto.randomUUID();

      // wait for the injected script inside the iframe to respond
      const result = await new Promise<{
        success: boolean;
        dataUrl?: string;
        error?: string;
        width?: number;
        height?: number;
      }>((resolve) => {
        const timeout = setTimeout(() => {
          window.removeEventListener("message", handler);
          resolve({ success: false, error: "TIMEOUT" });
        }, 5000);

        const handler = (event: MessageEvent) => {
          if (
            event.data?.type === "MULTISTREAM_CAPTURE_RESULT" &&
            event.data?.requestId === requestId
          ) {
            clearTimeout(timeout);
            window.removeEventListener("message", handler);
            resolve(event.data);
          }
        };

        window.addEventListener("message", handler);
        iframe.contentWindow!.postMessage(
          { type: "MULTISTREAM_CAPTURE", requestId },
          "*",
        );
      });

      if (!result.success) {
        if (result.error === "TAINTED_CANVAS") {
          toast.error(t("toasts.screenshot.blocked"));
        } else if (result.error === "TIMEOUT") {
          toast.error(t("toasts.screenshot.timeout"));
        } else {
          toast.error(t("toasts.screenshot.noStream"));
        }
        return;
      }

      // build filename: channel_platform_YYYY-MM-DD_HH-mm-ss.png
      const now = new Date();
      const YYYY = now.getFullYear();
      const MM = (now.getMonth() + 1).toString().padStart(2, "0");
      const DD = now.getDate().toString().padStart(2, "0");
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      const ss = now.getSeconds().toString().padStart(2, "0");
      const timestamp = `${YYYY}-${MM}-${DD}_${hh}-${mm}-${ss}`;
      const filename = `${channel}_${platform}_${timestamp}.png`;

      if (isTauri()) {
        const savedPath = await invoke<string>("save_screenshot", {
          dataUrl: result.dataUrl,
          filename,
        });
        toast.success(`${t("toasts.screenshot.saved")}`, {
          description: savedPath,
          duration: 3500,
        });
      } else {
        // browser fallback: trigger download
        const link = document.createElement("a");
        link.href = result.dataUrl!;
        link.download = filename;
        link.click();
        toast.success(`${t("toasts.screenshot.saved")}`);
      }
    } catch (error) {
      console.error("Screenshot capture failed:", error);
      toast.error(t("toasts.screenshot.failed"));
    } finally {
      isCapturing.value = false;
    }
  };

  return {
    isCapturing,
    captureStream,
  };
}

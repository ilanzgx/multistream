import { onMounted, onUnmounted } from "vue";
import { onOpenUrl, getCurrent } from "@tauri-apps/plugin-deep-link";
import { useStreams } from "./useStreams";
import { parseUrlOptions } from "../lib/parseUrlOptions";
import { toast } from "vue-sonner";
import { i18n } from "../i18n";

export function useDeepLink() {
  const { addStream, clearStreams } = useStreams();
  let unlisten: (() => void) | null = null;

  const handleDeepLink = async (urls: string[] | null) => {
    if (!urls) return;
    for (const link of urls) {
      try {
        const url = new URL(link);

        // Handle Share/Open Links
        if (url.protocol === "multistream:" && url.host === "share") {
          const parsedStreams = parseUrlOptions(url.search);
          if (parsedStreams && parsedStreams.length > 0) {
            clearStreams();
            parsedStreams.forEach((s) => addStream(s.channel, s.platform, s.iframeUrl));
            toast.success(i18n.global.t("import.deepLinkSuccess"));
          }
        }
      } catch (e) {
        console.error("Failed to parse deep link:", link, e);
      }
    }
  };

  onMounted(async () => {
    try {
      unlisten = await onOpenUrl(handleDeepLink);

      const initialUrls = await getCurrent();
      if (initialUrls && initialUrls.length > 0) {
        await handleDeepLink(initialUrls);
      }
    } catch (e) {
      console.warn("Deep linking not supported or failed to initialize:", e);
    }
  });

  onUnmounted(() => {
    if (unlisten) {
      unlisten();
    }
  });
}

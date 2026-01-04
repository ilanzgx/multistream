import { ref } from "vue";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";

const updateAvailable = ref(false);
const updateVersion = ref<string | null>(null);
const isChecking = ref(false);
const isDownloading = ref(false);
const downloadProgress = ref(0);

let currentUpdate: Update | null = null;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function useUpdater() {
  const { t } = useI18n();

  async function checkForUpdates(showNoUpdateToast = false) {
    if (!isTauri()) return;
    if (isChecking.value) return;

    isChecking.value = true;

    try {
      const update = await check();

      if (update) {
        updateAvailable.value = true;
        updateVersion.value = update.version;
        currentUpdate = update;

        toast.info(`${t("toasts.update.newVersion")}: ${update.version}`, {
          action: {
            label: "Update",
            onClick: () => installUpdate(),
          },
          duration: 10000,
        });
      } else if (showNoUpdateToast) {
        toast.success(`${t("toasts.update.latestVersion")}`);
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
      if (showNoUpdateToast) {
        toast.error(`${t("toasts.update.failedCheck")}`);
      }
    } finally {
      isChecking.value = false;
    }
  }

  async function installUpdate() {
    if (!currentUpdate) return;

    isDownloading.value = true;
    downloadProgress.value = 0;

    try {
      toast.loading(`${t("toasts.update.downloading")}`, {
        id: "update-download",
      });

      await currentUpdate.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          console.log(`Download started, size: ${event.data.contentLength}`);
        } else if (event.event === "Progress") {
          downloadProgress.value += event.data.chunkLength;
        } else if (event.event === "Finished") {
          console.log("Download finished");
        }
      });

      toast.success(`${t("toasts.update.success")}`, {
        id: "update-download",
      });

      setTimeout(async () => {
        await relaunch();
      }, 1500);
    } catch (error) {
      console.error("Failed to install update:", error);
      toast.error(`${t("toasts.update.failedUpdate")}`, {
        id: "update-download",
      });
    } finally {
      isDownloading.value = false;
    }
  }

  return {
    updateAvailable,
    updateVersion,
    isChecking,
    isDownloading,
    downloadProgress,
    checkForUpdates,
    installUpdate,
  };
}

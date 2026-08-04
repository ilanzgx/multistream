import { ref, h } from "vue";
import { isTauri as _isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import UpdateProgress from "@/components/ui/sonner/UpdateProgress.vue";

const updateAvailable = ref(false);
const updateVersion = ref<string | null>(null);
const isChecking = ref(false);
const isDownloading = ref(false);
const downloadProgress = ref(0);
const contentLength = ref(0);

let currentUpdate: Update | null = null;

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    _isTauri() ||
    "__TAURI_INTERNALS__" in window ||
    "__TAURI_IPC__" in window ||
    "__TAURI__" in window
  );
}

export function useUpdater() {
  const { t } = useI18n();

  /**
   * @brief Check for updates
   *
   * Checks for updates and shows a toast if an update is available.
   *
   * @param showNoUpdateToast Whether to show a toast if no update is available
   * @return void
   */
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

  /**
   * @brief Install update
   *
   * Installs the update and shows a toast if the update is installed.
   *
   * @return void
   */
  async function installUpdate() {
    if (!currentUpdate) return;

    isDownloading.value = true;
    downloadProgress.value = 0;
    contentLength.value = 0;
    let lastToastUpdate = 0;

    try {
      toast.custom(
        h(UpdateProgress, {
          downloaded: downloadProgress.value,
          total: contentLength.value,
        }),
        {
          id: "update-download",
          class: "bg-transparent border-none shadow-none !p-0",
        }
      );

      await currentUpdate.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          contentLength.value = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloadProgress.value += event.data.chunkLength;

          const now = Date.now();
          // Throttle UI updates to roughly 4 frames per second to prevent freezing
          if (now - lastToastUpdate > 250) {
            lastToastUpdate = now;

            toast.custom(
              h(UpdateProgress, {
                downloaded: downloadProgress.value,
                total: contentLength.value,
              }),
              {
                id: "update-download",
                class: "bg-transparent border-none shadow-none !p-0",
              }
            );
          }
        } else if (event.event === "Finished") {
          toast.custom(
            h(UpdateProgress, {
              downloaded: contentLength.value, // Force 100%
              total: contentLength.value,
            }),
            {
              id: "update-download",
              class: "bg-transparent border-none shadow-none !p-0",
            }
          );
        }
      });

      toast.success(`${t("toasts.update.success")}`, {
        id: "update-download",
        description: "",
      });

      setTimeout(async () => {
        await relaunch();
      }, 1500);
    } catch (error) {
      console.error("Failed to install update:", error);
      toast.error(`${t("toasts.update.failedUpdate")}`, {
        id: "update-download",
        description: "",
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
    contentLength,
    checkForUpdates,
    installUpdate,
  };
}

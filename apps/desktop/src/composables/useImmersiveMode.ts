import { ref } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { usePreferences } from "./usePreferences";
import { isTauri } from "./useUpdater";

const HIDE_DELAY_MS = 400;

const _useImmersiveMode = () => {
  const { immersiveModeEnabled, setImmersiveModeEnabled } = usePreferences();

  const isFullscreen = ref(false);
  const isLeftPanelRevealed = ref(false);
  const isRightPanelRevealed = ref(false);

  let leftHideTimer: ReturnType<typeof setTimeout> | null = null;
  let rightHideTimer: ReturnType<typeof setTimeout> | null = null;

  const clearLeftTimer = () => {
    if (leftHideTimer) {
      clearTimeout(leftHideTimer);
      leftHideTimer = null;
    }
  };

  const clearRightTimer = () => {
    if (rightHideTimer) {
      clearTimeout(rightHideTimer);
      rightHideTimer = null;
    }
  };

  const revealLeftPanel = () => {
    clearLeftTimer();
    isLeftPanelRevealed.value = true;
  };

  const scheduleHideLeftPanel = (delayMs = HIDE_DELAY_MS) => {
    clearLeftTimer();
    leftHideTimer = setTimeout(() => {
      isLeftPanelRevealed.value = false;
      leftHideTimer = null;
    }, delayMs);
  };

  const revealRightPanel = () => {
    clearRightTimer();
    isRightPanelRevealed.value = true;
  };

  const scheduleHideRightPanel = (delayMs = HIDE_DELAY_MS) => {
    clearRightTimer();
    rightHideTimer = setTimeout(() => {
      isRightPanelRevealed.value = false;
      rightHideTimer = null;
    }, delayMs);
  };

  const hideAllPanels = () => {
    clearLeftTimer();
    clearRightTimer();
    isLeftPanelRevealed.value = false;
    isRightPanelRevealed.value = false;
  };

  const syncFullscreenState = async () => {
    if (isTauri()) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        isFullscreen.value = await getCurrentWindow().isFullscreen();
      } catch (err) {
        console.warn("Failed to query window fullscreen state:", err);
      }
      return;
    }

    if (typeof document !== "undefined") {
      isFullscreen.value = Boolean(document.fullscreenElement);
    }
  };

  const toggleFullscreen = async () => {
    const nextState = !isFullscreen.value;

    if (isTauri()) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setFullscreen(nextState);
        isFullscreen.value = nextState;
      } catch (err) {
        console.warn("Failed to toggle Tauri window fullscreen:", err);
      }
    } else if (typeof document !== "undefined") {
      try {
        if (nextState) {
          await document.documentElement.requestFullscreen?.();
        } else if (document.fullscreenElement) {
          await document.exitFullscreen?.();
        }
        isFullscreen.value = Boolean(document.fullscreenElement);
      } catch (err) {
        console.warn("Failed to toggle browser fullscreen:", err);
      }
    }

    if (isFullscreen.value === nextState) {
      setImmersiveModeEnabled(nextState);
      hideAllPanels();
    }
  };

  const toggleImmersiveMode = () => {
    const next = !immersiveModeEnabled.value;
    setImmersiveModeEnabled(next);
    hideAllPanels();
  };

  const handleEscape = async () => {
    if (isLeftPanelRevealed.value || isRightPanelRevealed.value) {
      hideAllPanels();
      return;
    }
    if (isFullscreen.value) {
      await toggleFullscreen();
      return;
    }
    if (immersiveModeEnabled.value) {
      setImmersiveModeEnabled(false);
      hideAllPanels();
    }
  };

  return {
    immersiveModeEnabled,
    isFullscreen,
    isLeftPanelRevealed,
    isRightPanelRevealed,
    revealLeftPanel,
    scheduleHideLeftPanel,
    revealRightPanel,
    scheduleHideRightPanel,
    hideAllPanels,
    syncFullscreenState,
    toggleFullscreen,
    toggleImmersiveMode,
    handleEscape,
  };
};

export const useImmersiveMode = createSharedComposable(_useImmersiveMode);

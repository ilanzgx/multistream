import { ref, getCurrentScope, onScopeDispose } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "@/lib/http";

const RECONNECT_DEBOUNCE_MS = 1200;
const ONLINE_PROBE_INTERVAL_MS = 4000;
const OFFLINE_PROBE_INTERVAL_MS = 2000;

const isTestEnv = import.meta.env?.MODE === "test";
let testProbeOverride: (() => Promise<boolean>) | null = null;

export function __setTestProbeOverride(override: (() => Promise<boolean>) | null) {
  testProbeOverride = override;
}

/**
 * @brief Performs an active network probe.
 * In Tauri desktop, calls Rust's native TCP check (which bypasses virtual adapters).
 * In browsers, uses a 204 endpoint with timeout.
 */
export async function probeConnectivity(): Promise<boolean> {
  if (isTauri()) {
    try {
      return await invoke<boolean>("check_network_connectivity");
    } catch {
      return false;
    }
  }

  if (isTestEnv) {
    if (testProbeOverride) {
      return await testProbeOverride();
    }
    return true;
  }

  // Web / non-tauri fallback
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }

  if (typeof window === "undefined" || typeof fetch === "undefined") {
    return true;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    await fetch("https://clients3.google.com/generate_204", {
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function _useNetworkStatus() {
  const isOnline = ref(
    typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
      ? navigator.onLine
      : true
  );
  const wasOffline = ref(false);
  const reconnectCount = ref(0);
  const reconnectCallbacks = new Set<() => void>();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let probeTimer: ReturnType<typeof setTimeout> | null = null;
  let isProbing = false;
  let connectivityGeneration = 0;
  let isDisposed = false;
  let unlistenTauriEvent: UnlistenFn | null = null;

  const handleOnline = () => {
    connectivityGeneration++;
    if (isOnline.value && !wasOffline.value && !debounceTimer) {
      return;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      isOnline.value = true;
      if (wasOffline.value) {
        wasOffline.value = false;
        reconnectCount.value++;
        reconnectCallbacks.forEach((cb) => {
          try {
            cb();
          } catch (err) {
            console.error("[useNetworkStatus] Reconnect callback error:", err);
          }
        });
      }
    }, RECONNECT_DEBOUNCE_MS);
  };

  const handleOffline = () => {
    connectivityGeneration++;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    isOnline.value = false;
    wasOffline.value = true;
  };

  const checkConnectivity = async (): Promise<boolean> => {
    if (isProbing || isDisposed) return isOnline.value;
    isProbing = true;
    const generation = connectivityGeneration;
    try {
      const online = await probeConnectivity();
      if (generation !== connectivityGeneration || isDisposed) {
        return isOnline.value;
      }
      if (!online) {
        handleOffline();
      } else if (!isOnline.value) {
        handleOnline();
      }
      return online;
    } finally {
      isProbing = false;
    }
  };

  const scheduleNextProbe = () => {
    if (isDisposed || typeof window === "undefined" || isTestEnv || isTauri()) return;
    if (probeTimer) {
      clearTimeout(probeTimer);
      probeTimer = null;
    }
    const delay = isOnline.value ? ONLINE_PROBE_INTERVAL_MS : OFFLINE_PROBE_INTERVAL_MS;
    probeTimer = setTimeout(async () => {
      await checkConnectivity();
      scheduleNextProbe();
    }, delay);
  };

  const onWindowOnline = () => {
    checkConnectivity();
  };
  const onWindowOffline = () => {
    if (isTauri()) {
      checkConnectivity();
    } else {
      handleOffline();
    }
  };
  const onWindowFocus = () => {
    checkConnectivity();
  };

  const cleanup = () => {
    isDisposed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onWindowOnline);
      window.removeEventListener("offline", onWindowOffline);
      window.removeEventListener("focus", onWindowFocus);
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (probeTimer) {
      clearTimeout(probeTimer);
      probeTimer = null;
    }
    if (unlistenTauriEvent) {
      unlistenTauriEvent();
      unlistenTauriEvent = null;
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", onWindowOnline);
    window.addEventListener("offline", onWindowOffline);
    window.addEventListener("focus", onWindowFocus);

    if (isTauri()) {
      listen<boolean>("network-status-changed", (event) => {
        if (event.payload) {
          handleOnline();
        } else {
          handleOffline();
        }
      })
        .then((unlisten) => {
          if (isDisposed) {
            unlisten();
          } else {
            unlistenTauriEvent = unlisten;
          }
        })
        .catch(() => {});
    }

    if (!isTestEnv) {
      // Immediate startup check
      checkConnectivity().finally(() => {
        scheduleNextProbe();
      });
    }

    onScopeDispose(cleanup);
  }

  function onReconnect(callback: () => void): () => void {
    reconnectCallbacks.add(callback);
    const off = () => {
      reconnectCallbacks.delete(callback);
    };
    if (getCurrentScope()) {
      onScopeDispose(off);
    }
    return off;
  }

  function __test_triggerOnline() {
    handleOnline();
  }

  function __test_triggerOffline() {
    handleOffline();
  }

  function __test_reset() {
    cleanup();
    isOnline.value = true;
    wasOffline.value = false;
    reconnectCount.value = 0;
    reconnectCallbacks.clear();
  }

  return {
    isOnline,
    wasOffline,
    reconnectCount,
    checkConnectivity,
    onReconnect,
    __test_triggerOnline,
    __test_triggerOffline,
    __test_reset,
  };
}

export const useNetworkStatus = createSharedComposable(_useNetworkStatus);

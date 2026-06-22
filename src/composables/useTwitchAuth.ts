import { ref, computed } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./useUpdater";

export interface AuthState {
  authenticated: boolean;
  username: string | null;
}

export interface DeviceFlowResponse {
  device_code: string;
  expires_in: number;
  interval: number;
  user_code: string;
  verification_uri: string;
}

const _useTwitchAuth = () => {
  const authenticated = ref(false);
  const username = ref<string | null>(null);
  const loading = ref(false);

  const isAuthenticated = computed(() => authenticated.value);

  let unlistenAuthChanged: UnlistenFn | null = null;
  let unlistenAuthError: UnlistenFn | null = null;

  async function init() {
    if (!isTauri()) return;

    try {
      const state = await invoke<AuthState>("twitch_get_auth_state");
      authenticated.value = state.authenticated;
      username.value = state.username;
    } catch {
      authenticated.value = false;
      username.value = null;
    }

    if (!unlistenAuthChanged) {
      unlistenAuthChanged = await listen<AuthState>("twitch-auth-changed", (event) => {
        authenticated.value = event.payload.authenticated;
        username.value = event.payload.username;
      });
    }

    if (!unlistenAuthError) {
      unlistenAuthError = await listen<string>("twitch-auth-error", (event) => {
        window.dispatchEvent(new CustomEvent("twitch-auth-error", { detail: event.payload }));
      });
    }
  }

  async function startLogin(): Promise<DeviceFlowResponse | null> {
    if (!isTauri() || loading.value) return null;
    loading.value = true;
    try {
      const response = await invoke<DeviceFlowResponse>("twitch_login");
      return response;
    } catch (e) {
      console.error("Failed to start Twitch auth flow:", e);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function cancelLogin() {
    if (!isTauri()) return;
    try {
      await invoke("twitch_cancel_login");
    } catch (e) {
      console.error("Failed to cancel Twitch auth flow:", e);
    }
  }

  async function logout() {
    if (!isTauri()) return;
    await invoke("twitch_logout");
  }

  if (isTauri()) {
    init().catch(console.error);
  }

  return {
    authenticated: isAuthenticated,
    username,
    loading,
    startLogin,
    cancelLogin,
    logout,
  };
};

export const useTwitchAuth = createSharedComposable(_useTwitchAuth);

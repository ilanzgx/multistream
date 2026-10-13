import { ref, computed, onScopeDispose } from "vue";
import { createSharedComposable, useStorage } from "@vueuse/core";
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

async function cancelLogin() {
  if (!isTauri()) return;
  try {
    await invoke("twitch_cancel_login");
  } catch (e) {
    console.error("Failed to cancel login", e);
  }
}

const _useTwitchAuth = () => {
  const storage = typeof localStorage !== "undefined" ? localStorage : undefined;
  const authenticated = useStorage<boolean>("twitch-authenticated", false, storage);
  const username = useStorage<string | null>("twitch-username", null, storage);
  const loading = ref(false);
  const isReady = ref(!isTauri());

  const isAuthenticated = computed(() => authenticated.value);

  let unlistenAuthChanged: UnlistenFn | null = null;
  let unlistenAuthError: UnlistenFn | null = null;

  async function init() {
    if (!isTauri()) {
      isReady.value = true;
      return;
    }

    try {
      const state = await invoke<AuthState>("twitch_get_auth_state");
      authenticated.value = state.authenticated;
      username.value = state.username;
    } catch {
      authenticated.value = false;
      username.value = null;
    } finally {
      isReady.value = true;
    }

    if (!unlistenAuthChanged) {
      unlistenAuthChanged = await listen<AuthState>("twitch-auth-changed", (event) => {
        authenticated.value = event.payload.authenticated;
        username.value = event.payload.username;
        isReady.value = true;
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

  async function logout() {
    if (!isTauri()) {
      authenticated.value = false;
      username.value = null;
      return;
    }
    try {
      await invoke("twitch_logout");
      authenticated.value = false;
      username.value = null;
    } catch (e) {
      console.error("Failed to logout", e);
    }
  }

  onScopeDispose(() => {
    if (unlistenAuthChanged) unlistenAuthChanged();
    if (unlistenAuthError) unlistenAuthError();
  });

  if (isTauri()) {
    init().catch(console.error);
  }

  return {
    authenticated: isAuthenticated,
    username,
    loading,
    isReady: computed(() => isReady.value),
    startLogin,
    cancelLogin,
    logout,
  };
};

export const useTwitchAuth = createSharedComposable(_useTwitchAuth);

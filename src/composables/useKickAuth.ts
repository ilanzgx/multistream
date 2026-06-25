import { ref, computed, onScopeDispose } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./useUpdater";

export interface KickAuthState {
  authenticated: boolean;
  username: string | null;
}

const _useKickAuth = () => {
  const authenticated = ref(false);
  const username = ref<string | null>(null);
  const loading = ref(false);
  const authUrl = ref<string | null>(null);

  const isAuthenticated = computed(() => authenticated.value);

  let unlistenAuthChanged: UnlistenFn | null = null;
  let unlistenAuthError: UnlistenFn | null = null;
  let unlistenAuthUrl: UnlistenFn | null = null;

  async function init() {
    if (!isTauri()) return;

    try {
      const state = await invoke<KickAuthState>("kick_get_auth_state");
      authenticated.value = state.authenticated;
      username.value = state.username;
    } catch {
      authenticated.value = false;
      username.value = null;
    }

    if (!unlistenAuthChanged) {
      unlistenAuthChanged = await listen<KickAuthState>("kick-auth-changed", (event) => {
        authenticated.value = event.payload.authenticated;
        username.value = event.payload.username;
      });
    }

    if (!unlistenAuthError) {
      unlistenAuthError = await listen<string>("kick-auth-error", (event) => {
        window.dispatchEvent(new CustomEvent("kick-auth-error", { detail: event.payload }));
      });
    }

    if (!unlistenAuthUrl) {
      unlistenAuthUrl = await listen<string>("kick-auth-url", (event) => {
        authUrl.value = event.payload;
      });
    }
  }

  async function startLogin() {
    if (!isTauri() || loading.value) return;
    loading.value = true;
    try {
      await invoke("kick_login");
    } catch (e) {
      console.error("Failed to start Kick auth flow:", e);
      window.dispatchEvent(new CustomEvent("kick-auth-error", { detail: String(e) }));
    } finally {
      loading.value = false;
      authUrl.value = null;
    }
  }

  async function logout() {
    if (!isTauri()) return;
    try {
      await invoke("kick_logout");
    } catch (e) {
      console.error("Failed to logout from Kick:", e);
    }
  }

  onScopeDispose(() => {
    if (unlistenAuthChanged) unlistenAuthChanged();
    if (unlistenAuthError) unlistenAuthError();
    if (unlistenAuthUrl) unlistenAuthUrl();
  });

  if (isTauri()) {
    init().catch(console.error);
  }

  return {
    authenticated: isAuthenticated,
    username,
    loading,
    authUrl,
    startLogin,
    logout,
  };
};

export const useKickAuth = createSharedComposable(_useKickAuth);

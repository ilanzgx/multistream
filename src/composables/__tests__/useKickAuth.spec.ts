import { effectScope, type EffectScope } from "vue";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("@/composables/useUpdater", () => ({
  isTauri: () => true,
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    locale: { value: "en" },
  }),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useKickAuth } from "../useKickAuth";

describe("useKickAuth", () => {
  let scope: EffectScope;

  beforeEach(() => {
    scope = effectScope();
    vi.clearAllMocks();
    (listen as ReturnType<typeof vi.fn>).mockResolvedValue(vi.fn());
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  });

  afterEach(() => {
    scope.stop();
    vi.unstubAllGlobals();
  });

  it("initialises as unauthenticated when backend returns false", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      authenticated: false,
      username: null,
    });

    // Act
    let auth: ReturnType<typeof useKickAuth>;
    await scope.run(async () => {
      auth = useKickAuth();
      // Wait for ensureInit to finish
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert
    expect(auth!.authenticated.value).toBe(false);
    expect(auth!.username.value).toBeNull();
  });

  it("sets authenticated and username from backend response", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      authenticated: true,
      username: "kickuser",
    });

    // Act
    let auth: ReturnType<typeof useKickAuth>;
    await scope.run(async () => {
      auth = useKickAuth();
      // Wait for ensureInit to finish
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert
    expect(auth!.authenticated.value).toBe(true);
    expect(auth!.username.value).toBe("kickuser");
  });

  it("calls kick_login on startLogin()", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      authenticated: false,
      username: null,
    });

    let auth: ReturnType<typeof useKickAuth>;
    scope.run(() => {
      auth = useKickAuth();
    });

    // Act
    await auth!.startLogin();

    // Assert
    expect(invoke).toHaveBeenCalledWith("kick_login", { locale: "en" });
    expect(auth!.loading.value).toBe(false);
  });

  it("calls kick_logout on logout()", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      authenticated: true,
      username: "kickuser",
    });

    let auth: ReturnType<typeof useKickAuth>;
    scope.run(() => {
      auth = useKickAuth();
    });

    // Act
    await auth!.logout();

    // Assert
    expect(invoke).toHaveBeenCalledWith("kick_logout");
  });

  it("calls kick_cancel_login on cancelLogin()", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      authenticated: false,
      username: null,
    });

    let auth: ReturnType<typeof useKickAuth>;
    scope.run(() => {
      auth = useKickAuth();
    });

    // Act
    await auth!.cancelLogin();

    // Assert
    expect(invoke).toHaveBeenCalledWith("kick_cancel_login");
  });

  it("handles invoke kick_get_auth_state failure", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockRejectedValueOnce("Error fetching state");

    // Act
    let auth: ReturnType<typeof useKickAuth>;
    await scope.run(async () => {
      auth = useKickAuth();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert
    expect(auth!.authenticated.value).toBe(false);
    expect(auth!.username.value).toBeNull();
  });

  it("handles invoke kick_login failure and dispatches event", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      authenticated: false,
      username: null,
    });
    let auth: ReturnType<typeof useKickAuth>;
    await scope.run(async () => {
      auth = useKickAuth();
      await Promise.resolve();
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    (invoke as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Login failed"));

    // Act
    await auth!.startLogin();

    // Assert
    expect(consoleSpy).toHaveBeenCalledWith("Failed to start Kick auth flow:", expect.any(Error));
    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls[0]![0] as CustomEvent;
    expect(event.type).toBe("kick-auth-error");
    expect(event.detail).toContain("Login failed");

    consoleSpy.mockRestore();
  });

  it("handles invoke kick_logout failure", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockImplementation(async (cmd) => {
      if (cmd === "kick_get_auth_state") return { authenticated: true, username: "user" };
      if (cmd === "kick_logout") throw new Error("Logout failed");
      return {};
    });

    let auth: ReturnType<typeof useKickAuth>;
    await scope.run(async () => {
      auth = useKickAuth();
      await Promise.resolve();
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Act
    await auth!.logout();

    // Assert
    expect(consoleSpy).toHaveBeenCalledWith("Failed to logout from Kick:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("handles invoke kick_cancel_login failure", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockImplementation(async (cmd) => {
      if (cmd === "kick_get_auth_state") return { authenticated: false, username: null };
      if (cmd === "kick_cancel_login") throw new Error("Cancel failed");
      return {};
    });

    let auth: ReturnType<typeof useKickAuth>;
    await scope.run(async () => {
      auth = useKickAuth();
      await Promise.resolve();
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Act
    await auth!.cancelLogin();

    // Assert
    expect(consoleSpy).toHaveBeenCalledWith("Failed to cancel Kick auth flow:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("handles listener events (kick-auth-error and kick-auth-url)", async () => {
    // Arrange
    let errorCallback: (e: any) => void = () => {};
    let urlCallback: (e: any) => void = () => {};

    (listen as ReturnType<typeof vi.fn>).mockImplementation(async (event: string, cb: any) => {
      if (event === "kick-auth-error") errorCallback = cb;
      if (event === "kick-auth-url") urlCallback = cb;
      return vi.fn();
    });

    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      authenticated: false,
      username: null,
    });

    let auth: ReturnType<typeof useKickAuth>;
    await scope.run(async () => {
      auth = useKickAuth();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    // Act
    errorCallback({ payload: "some error message" });

    // Assert
    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls[0]![0] as CustomEvent;
    expect(event.type).toBe("kick-auth-error");
    expect(event.detail).toBe("some error message");

    // Act
    urlCallback({ payload: "https://auth.url" });

    // Assert
    expect(auth!.authUrl.value).toBe("https://auth.url");
  });
});

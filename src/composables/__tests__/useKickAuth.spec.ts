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
    expect(invoke).toHaveBeenCalledWith("kick_login");
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
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { effectScope } from "vue";
import { _useNetworkStatus, __setTestProbeOverride } from "../useNetworkStatus";

describe("useNetworkStatus composable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    __setTestProbeOverride(null);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should initialize with online status by default", () => {
    // Arrange & Act
    const { isOnline, wasOffline, reconnectCount } = _useNetworkStatus();

    // Assert
    expect(isOnline.value).toBe(true);
    expect(wasOffline.value).toBe(false);
    expect(reconnectCount.value).toBe(0);
  });

  it("should update state to offline immediately when offline is triggered", () => {
    // Arrange
    const { isOnline, wasOffline, __test_triggerOffline } = _useNetworkStatus();

    // Act
    __test_triggerOffline();

    // Assert
    expect(isOnline.value).toBe(false);
    expect(wasOffline.value).toBe(true);
  });

  it("should debounce reconnect and trigger registered callbacks upon returning online", () => {
    // Arrange
    const network = _useNetworkStatus();
    const reconnectCallback = vi.fn();
    network.onReconnect(reconnectCallback);

    // Act - go offline
    network.__test_triggerOffline();
    expect(network.isOnline.value).toBe(false);

    // Act - trigger online
    network.__test_triggerOnline();

    // Assert - during debounce, still not marked online and callback not yet executed
    expect(network.isOnline.value).toBe(false);
    expect(reconnectCallback).not.toHaveBeenCalled();

    // Act - advance timers past debounce (1200ms)
    vi.advanceTimersByTime(1200);

    // Assert
    expect(network.isOnline.value).toBe(true);
    expect(network.wasOffline.value).toBe(false);
    expect(network.reconnectCount.value).toBe(1);
    expect(reconnectCallback).toHaveBeenCalledTimes(1);
  });

  it("should cancel online debounce if offline event occurs before timer finishes", () => {
    // Arrange
    const network = _useNetworkStatus();
    const reconnectCallback = vi.fn();
    network.onReconnect(reconnectCallback);

    // Act
    network.__test_triggerOffline();
    network.__test_triggerOnline();
    vi.advanceTimersByTime(500); // 500ms elapsed
    network.__test_triggerOffline(); // Network flaps back offline
    vi.advanceTimersByTime(1000); // Exceeds original 1200ms

    // Assert
    expect(network.isOnline.value).toBe(false);
    expect(reconnectCallback).not.toHaveBeenCalled();
    expect(network.reconnectCount.value).toBe(0);
  });

  it("should allow unsubscribing from onReconnect callback", () => {
    // Arrange
    const network = _useNetworkStatus();
    const reconnectCallback = vi.fn();
    const unsubscribe = network.onReconnect(reconnectCallback);

    // Act
    unsubscribe();
    network.__test_triggerOffline();
    network.__test_triggerOnline();
    vi.advanceTimersByTime(1200);

    // Assert
    expect(network.isOnline.value).toBe(true);
    expect(reconnectCallback).not.toHaveBeenCalled();
  });

  it("should automatically unsubscribe onReconnect callback when caller effectScope is disposed", () => {
    // Arrange
    const network = _useNetworkStatus();
    const reconnectCallback = vi.fn();
    const scope = effectScope();

    scope.run(() => {
      network.onReconnect(reconnectCallback);
    });

    // Act - dispose caller scope (simulating component unmount / HMR reload)
    scope.stop();
    network.__test_triggerOffline();
    network.__test_triggerOnline();
    vi.advanceTimersByTime(1200);

    // Assert
    expect(network.isOnline.value).toBe(true);
    expect(reconnectCallback).not.toHaveBeenCalled();
  });

  it("should trigger offline state when checkConnectivity resolves to false", async () => {
    // Arrange
    const network = _useNetworkStatus();
    expect(network.isOnline.value).toBe(true);
    __setTestProbeOverride(async () => false);

    // Act
    const result = await network.checkConnectivity();

    // Assert
    expect(result).toBe(false);
    expect(network.isOnline.value).toBe(false);
    expect(network.wasOffline.value).toBe(true);
  });

  it("should trigger online transition when checkConnectivity resolves to true after offline", async () => {
    // Arrange
    const network = _useNetworkStatus();
    const reconnectCallback = vi.fn();
    network.onReconnect(reconnectCallback);
    network.__test_triggerOffline();
    expect(network.isOnline.value).toBe(false);
    expect(network.wasOffline.value).toBe(true);
    __setTestProbeOverride(async () => true);

    // Act
    const result = await network.checkConnectivity();
    vi.advanceTimersByTime(1200);

    // Assert
    expect(result).toBe(true);
    expect(network.isOnline.value).toBe(true);
    expect(network.wasOffline.value).toBe(false);
    expect(reconnectCallback).toHaveBeenCalledTimes(1);
  });

  it("should ignore stale online probe result if an offline event occurs while probing", async () => {
    // Arrange
    const network = _useNetworkStatus();
    const reconnectCallback = vi.fn();
    network.onReconnect(reconnectCallback);

    let resolveProbe!: (value: boolean) => void;
    __setTestProbeOverride(
      () =>
        new Promise<boolean>((resolve) => {
          resolveProbe = resolve;
        })
    );

    // Act - start probing while online, then go offline before probe resolves
    const probePromise = network.checkConnectivity();
    network.__test_triggerOffline();
    expect(network.isOnline.value).toBe(false);

    // Resolve stale probe with true
    resolveProbe(true);
    const result = await probePromise;
    vi.advanceTimersByTime(1500);

    // Assert - must remain offline and not trigger reconnect
    expect(result).toBe(false);
    expect(network.isOnline.value).toBe(false);
    expect(network.wasOffline.value).toBe(true);
    expect(reconnectCallback).not.toHaveBeenCalled();
  });

  it("should ignore stale offline probe result if an online transition occurs while probing", async () => {
    // Arrange
    const network = _useNetworkStatus();
    const reconnectCallback = vi.fn();
    network.onReconnect(reconnectCallback);
    network.__test_triggerOffline();

    let resolveProbe!: (value: boolean) => void;
    __setTestProbeOverride(
      () =>
        new Promise<boolean>((resolve) => {
          resolveProbe = resolve;
        })
    );

    // Act - start probing while offline, then transition online before probe resolves
    const probePromise = network.checkConnectivity();
    network.__test_triggerOnline();
    vi.advanceTimersByTime(1200);
    expect(network.isOnline.value).toBe(true);
    expect(reconnectCallback).toHaveBeenCalledTimes(1);

    // Resolve stale probe with false
    resolveProbe(false);
    const result = await probePromise;

    // Assert - must remain online and not revert to offline
    expect(result).toBe(true);
    expect(network.isOnline.value).toBe(true);
    expect(network.wasOffline.value).toBe(false);
  });
});

import { config } from "@vue/test-utils";

// Ignore Vue i18n warnings in tests or add global mocks if necessary
config.global.mocks = {
  $t: (msg: string) => msg,
};

// Local storage mock for tests
if (typeof globalThis.localStorage === "undefined") {
  const localStorageMock = (() => {
    let store: Record<string, string> = {};

    return {
      getItem(key: string) {
        return store[key] ?? null;
      },

      setItem(key: string, value: string) {
        store[key] = String(value);
      },

      removeItem(key: string) {
        delete store[key];
      },

      clear() {
        store = {};
      },

      key(index: number) {
        const keys = Object.keys(store);
        return keys[index] ?? null;
      },

      get length() {
        return Object.keys(store).length;
      },
    };
  })();

  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
}

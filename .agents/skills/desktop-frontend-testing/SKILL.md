---
name: multistream-desktop-frontend-testing
description: Comprehensive guide and pragmatic patterns for authoring unit tests using Vitest in Multistream. Covers the AAA (Arrange, Act, Assert) pattern, Vue 3 composables testing with effectScope, Tauri 2 IPC mocking (@tauri-apps/api/core), fake timers, state isolation, and coverage targets. Use when creating new unit test files, writing tests for composables/utilities, fixing flaky tests, or analyzing Vitest test coverage.
---

# Multistream Desktop Frontend Testing Guide (`apps/desktop/src/`)

This guide defines the engineering standards, mocking strategies, and architectural rules for writing unit tests with Vitest across the Multistream Vue 3 desktop app (`apps/desktop/src/`).

---

## 1. Core Testing Workflow & Iron Laws

### A. The AAA (Arrange, Act, Assert) Pattern
EVERY test case MUST be structured into three distinct phases demarcated by explicit code comments:

```typescript
it("should update favorite channel state", () => {
  // Arrange
  const { addFavorite, favorites } = useFavorites();
  favorites.value = [];

  // Act
  addFavorite("gaules", "twitch");

  // Assert
  expect(favorites.value.length).toBe(1);
  expect(favorites.value[0]?.channel).toBe("gaules");
});
```

---

### B. The 5 Iron Laws of Testing
1. **Strict State Isolation:** Clear `localStorage`, reset mocks with `vi.clearAllMocks()`, and reset composable singleton state in `beforeEach()`. Unstub globals in `afterEach()`.
2. **Assert Specific Outcomes:** Use `.toBe("expected")`, `.toEqual({...})`, or `.toThrow(...)`. NEVER rely on `.toBeTruthy()` or `.toBeDefined()` alone.
3. **Test Behavior, Not Implementation:** Assert reactive `ref` values, returned objects, and IPC calls — do not inspect unexposed internal closure variables.
4. **Zero Order Dependencies:** Each test case MUST run independently in any order without relying on previous test executions.
5. **No Production Data / Live APIs:** Mock all Tauri IPC commands (`invoke`), event listeners (`listen`), and HTTP calls (`fetch`).
6. **NEVER FORGET TESTS:** Whenever you add a new feature, a new rule, or modify existing behavior, you MUST add or update the corresponding tests. Never wait to be asked. NEVER delete tests.

---

## 2. Directory Structure & File Naming Conventions

Unit tests live in `__tests__/` subdirectories adjacent to the target code or in `composables/__tests__/`:

```
apps/desktop/src/
├── composables/
│   ├── useFavorites.ts
│   ├── useTwitchAuth.ts
│   └── __tests__/
│       ├── useFavorites.spec.ts
│       └── useTwitchAuth.spec.ts
└── lib/
    ├── urlParser.ts
    └── __tests__/
        └── urlParser.spec.ts
```

- **File Naming:** `<moduleName>.spec.ts` or `<moduleName>.test.ts`.

---

## 3. Standard Mocking Patterns for Vitest

### A. Mocking Tauri 2 IPC (`@tauri-apps/api/core` & `@tauri-apps/api/event`)

Always hoist Tauri mocks to the top of your test file before importing the target composable:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { effectScope, type EffectScope } from "vue";

// 1. Hoist Tauri module mocks
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

// 2. Import mocked symbols and target module
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTwitchAuth } from "../useTwitchAuth";

describe("useTwitchAuth unit tests", () => {
  let scope: EffectScope;

  beforeEach(() => {
    scope = effectScope();
    vi.clearAllMocks();
    (listen as ReturnType<typeof vi.fn>).mockResolvedValue(vi.fn());
  });

  afterEach(() => {
    scope.stop();
  });

  it("should initialize as authenticated when backend returns valid user", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      authenticated: true,
      username: "gaules",
    });

    // Act
    let auth: ReturnType<typeof useTwitchAuth>;
    await scope.run(async () => {
      auth = useTwitchAuth();
      await Promise.resolve();
    });

    // Assert
    expect(auth!.authenticated.value).toBe(true);
    expect(auth!.username.value).toBe("gaules");
  });
});
```

---

### B. Mocking Global `fetch` & `window` APIs (with Leak Prevention)

When mocking `window.fetch` or global browser APIs, ALWAYS call `vi.unstubAllGlobals()` in `afterEach()` to prevent mock leaks across test suites:

```typescript
describe("fetchStreamData unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should parse channel data from API response", async () => {
    // Arrange
    const mockResponse = { id: "123", name: "streamer" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })
    );

    // Act
    const data = await fetchStreamData("streamer");

    // Assert
    expect(data.name).toBe("streamer");
  });
});
```

---

### C. Testing Time & Debounce with Fake Timers

Use `vi.useFakeTimers()` to test debounced searches, polling intervals, or watch time counters without real delays:

```typescript
describe("useChannelSearch debounce unit tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should debounce search requests by 300ms", async () => {
    // Arrange
    const { searchQuery, searchResults } = useChannelSearch();

    // Act
    searchQuery.value = "gaules";
    expect(searchResults.value.length).toBe(0);

    // Advance time by 300ms
    vi.advanceTimersByTime(300);
    await Promise.resolve();

    // Assert
    expect(searchResults.value.length).toBeGreaterThan(0);
  });
});
```

---

## 4. Running & Validating Tests

Execute Vitest test commands from the monorepo root:

| Purpose | Command |
| :--- | :--- |
| **Run All Unit Tests** | `bun run desktop:test` |
| **Run Single Test File** | `bun run desktop:test useFavorites.spec.ts` |
| **Check Test Coverage** | `bun run desktop:test:coverage` |

---

## 5. Pragmatic Quality Checklist for New Tests

Before submitting any new test file or test case:

1. **AAA Pattern:** Are all test cases explicitly commented with `// Arrange`, `// Act`, and `// Assert`?
2. **Mock Leak Prevention:** Does `afterEach()` call `scope.stop()`, `vi.useRealTimers()`, or `vi.unstubAllGlobals()` if timers/globals were mocked?
3. **Specific Assertions:** Are expectations testing exact values (`expect(val).toBe(...)`) instead of loose boolean checks?
4. **Execution Check:** Did you run `bun run desktop:test` to confirm all tests pass cleanly without errors or warnings?

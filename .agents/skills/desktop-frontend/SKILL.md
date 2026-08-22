---
name: multistream-desktop-frontend
description: Pragmatic architecture guide and patterns for creating and scaling UI interfaces, TypeScript types, composables, Vue 3 components, i18n, accessibility (a11y), and unit tests in src/. Use when adding new features, building UI components, writing tests, or refactoring the desktop frontend.
---

# Frontend Architecture & Scalability Guide (`src/`)

This guide defines practical engineering patterns for creating UI interfaces, type systems, composables, components, and unit tests to keep the Multistream frontend scalable, type-safe, clean, accessible, and standardized.

---

## 1. Directory Mapping & Core Responsibilities

```
src/
├── components/           # [PRESENTATION / UI] Interfaces, panels, and user interaction
│   ├── chat/             # Platform-specific, unified, and rich-input chat UIs
│   ├── stream/           # Video players and iframe/HLS wrappers
│   ├── main/             # Main layout regions (Grid, Sidebars, Overlays)
│   ├── dialogs/          # Application modals (Settings, Auth, Add, Share)
│   └── ui/               # Decoupled shadcn-vue primitives (Button, Dialog, Select, etc.)
├── composables/          # [STATE & LOGIC] Business rules and shared reactive state
│   └── __tests__/        # Unit tests for each composable (Vitest)
├── config/               # Static constants and metadata (platforms, i18n)
├── lib/                  # Pure utility functions (no Vue reactive state)
└── i18n/locales/         # JSON translation dictionaries (en, pt, es, de, ru, cn)
```

---

## 2. UI & Interface Development Standards

When creating or modifying ANY component or interface in `src/components/`, you must enforce three core pillars: **Design System Palette**, **100% i18n Coverage**, and **Accessibility (a11y)**.

### A. Design System & Aesthetic Palette

- **Strict Neutral Dark Theme:** Respect the existing dark color hierarchy. Do not invent jarring new colors or bright visual patterns:
  - Outer background / App shell: `bg-[#0f1115]` or `bg-[#191b1f]`
  - Surface cards / Sidebars / Modals: `bg-[#14161a]`
  - Inner containers / Inputs / Secondary items: `bg-[#1f2227]`
  - Borders: `border-[#2a2d33]` or `border-white/5`
  - Primary Text: `text-white` or `text-[#eaeaea]`
  - Muted Text: `text-gray-400` or `text-[#787774]`
- **Use UI Primitives:** Prefer established components from `src/components/ui/` (`Button`, `Dialog`, `Input`, `Switch`, `Tabs`, `Slider`, `Tooltip`) over raw unstyled HTML elements.
- **Interactive Feedback:** Add smooth transitions (`transition-colors`, `hover:bg-[#1c1f24]`, `active:scale-95`).

---

### B. Internationalization (i18n) Standards

- **Zero Hardcoded Text:** EVERY single user-facing text string MUST use `$t('key')` or `t('key')`.
- **Full Parity Across 6 Locales:** When adding a new key, it MUST be defined across ALL 6 translation files in `src/i18n/locales/`:
  - `en.json` (English - reference)
  - `pt.json` (Portuguese)
  - `es.json` (Spanish)
  - `de.json` (German)
  - `ru.json` (Russian)
  - `cn.json` (Chinese)
- **Dynamic Interpolation:** Pass dynamic variables using `$t('key', { varName: value })`.

---

### C. Accessibility (a11y) Standards

- **Keyboard Navigation:**
  - Interactive elements must be focusable via `Tab` key.
  - Custom click handlers (`@click`) on non-button elements MUST include `@keydown.enter` / `@keydown.space` or use native `<button>`.
  - Ensure focus rings are visible (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`).
- **Screen Reader Support & ARIA:**
  - Icon-only buttons MUST have `aria-label="$t('...')"`.
  - Decorative icons must have `aria-hidden="true"`.
  - Modals and dialogs must implement `role="dialog"` and `aria-modal="true"`.
- **Semantic HTML:** Use proper tags (`<main>`, `<nav>`, `<header>`, `<aside>`, `<button>`, `<form>`) instead of generic `<div>`s everywhere.
- **Minimum Click Targets:** Ensure interactive elements have a touch/click target of at least 32px height/width (`min-h-[32px] min-w-[32px]`).

---

### UI Component Example (`src/components/main/ExamplePanel.vue`)

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { Settings, X } from "@lucide/vue";
import { Button } from "../ui/button";

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { t } = useI18n();
</script>

<template>
  <aside
    class="flex flex-col w-80 bg-[#14161a] border-l border-[#2a2d33] p-4 text-white"
    aria-label="Settings panel"
  >
    <!-- Header -->
    <header class="flex items-center justify-between pb-3 border-b border-[#2a2d33]">
      <div class="flex items-center gap-2">
        <Settings class="w-4 h-4 text-gray-400" aria-hidden="true" />
        <h2 class="text-sm font-bold text-[#eaeaea]">{{ $t("panel.title") }}</h2>
      </div>
      <button
        type="button"
        class="p-1 rounded text-gray-400 hover:text-white hover:bg-[#1f2227] transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500"
        :aria-label="$t('common.close')"
        @click="emit('close')"
      >
        <X class="w-4 h-4" aria-hidden="true" />
      </button>
    </header>

    <!-- Body -->
    <main class="flex-1 py-4 text-xs text-gray-400">
      <p>{{ $t("panel.description") }}</p>
    </main>
  </aside>
</template>
```

---

## 3. TypeScript Standards & Type Safety

Leverage modern TypeScript features to guarantee type safety without over-complicating types.

### A. Discriminated Unions for UI & Async States

Represent component and request states using explicit discriminated unions to eliminate invalid UI states:

```typescript
export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

// Type predicate guard for template/script narrowing
export function isSuccess<T>(state: AsyncState<T>): state is { status: "success"; data: T } {
  return state.status === "success";
}
```

### B. Prefer `as const` Literal Unions over Enums

Avoid TypeScript `enum`s. Prefer string literal unions or `as const` object configurations for platform constants and configuration objects:

```typescript
export const PLATFORMS = ["twitch", "kick", "youtube", "custom"] as const;
export type Platform = (typeof PLATFORMS)[number];
```

### C. Type Validation with `satisfies`

Use the `satisfies` operator to validate object structures against interfaces without broadening literal inferences:

```typescript
export interface PlatformMeta {
  name: string;
  color: string;
}

export const platformConfigs = {
  twitch: { name: "Twitch", color: "#9146FF" },
  kick: { name: "Kick", color: "#53FC18" },
} satisfies Record<string, PlatformMeta>;
```

### D. TypeScript Anti-Patterns to Avoid

- **No Untyped `any`:** Use `unknown` or explicit generics when type is uncertain.
- **No Non-Null Assertions (`!`):** Prefer early returns or optional chaining (`?.`).
- **No Type Casting Overuse (`as X`):** Rely on type guards or explicit validation functions instead of forcing types.

---

## 4. Stateful Logic: Creating Reusable Composables

All shared state or business rules that can be isolated or tested independently live in `src/composables/`.

- **Singleton State:** Use `createSharedComposable` from `@vueuse/core` for global state (e.g. active streams, favorites, auth).
- **Encapsulation:** Return `Ref`s that are updated exclusively via explicit methods.

```typescript
import { createSharedComposable, useStorage } from "@vueuse/core";

export interface Item {
  id: string;
  name: string;
}

const _useExample = () => {
  const items = useStorage<Item[]>("multistream_items", []);

  const addItem = (name: string) => {
    if (!name.trim()) return;
    items.value = [{ id: crypto.randomUUID(), name: name.trim() }, ...items.value];
  };

  const removeItem = (id: string) => {
    items.value = items.value.filter((i) => i.id !== id);
  };

  const clearItems = () => {
    items.value = [];
  };

  return { items, addItem, removeItem, clearItems };
};

export const useExample = createSharedComposable(_useExample);
```

---

## 5. Unit Testing Composables (AAA Pattern)

Every rule in a composable must be tested in `src/composables/__tests__/`.

- **AAA Pattern:** Structure EVERY test case with explicit comments: `// Arrange`, `// Act`, `// Assert`.
- **State Cleanup:** In `beforeEach`, clear `localStorage`, reset `vi` mocks, and call the clear function on the SUT.

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useExample } from "../useExample";

describe("useExample composable unit tests", () => {
  let sut: ReturnType<typeof useExample>;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();

    sut = useExample();
    sut.clearItems();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should add a new item successfully", () => {
    // Arrange
    const { addItem, items } = sut;

    // Act
    addItem("My Item");

    // Assert
    expect(items.value.length).toBe(1);
    expect(items.value[0]?.name).toBe("My Item");
  });
});
```

---

## 6. Pragmatic Scaling Checklists

### A. UI / Interface Checklist (Building Components & Layouts)

1. **Design System Check:** Does it strictly use the neutral dark palette (`#0f1115`, `#14161a`, `#1f2227`, `#2a2d33`) and `src/components/ui/` primitives?
2. **Strict i18n Parity Check:** You MUST pay extra attention and double-check your work to ensure strict parity across ALL 6 JSON files (`en.json`, `pt.json`, `es.json`, `de.json`, `ru.json`, `cn.json`) before considering any UI implementation complete. Do not rely solely on Vue `$t` fallbacks.
3. **Accessibility (a11y) Check:**
   - Are icon-only buttons labeled with `aria-label`?
   - Are decorative icons hidden with `aria-hidden="true"`?
   - Is keyboard focus ring visible on `Tab` focus?
   - Are semantic tags used (`<button>`, `<header>`, `<aside>`, `<nav>`)?

### B. Type Safety Checklist

1. **No `any` or `!`:** Are inputs and refs properly typed without `any` or non-null assertions?
2. **Discriminated Unions:** Are async/component states modeled with explicit status discriminators?
3. **Literal Types:** Are constants defined with `as const` or validated via `satisfies`?

### C. Stateful Feature Checklist (Adding Logic & Workflows)

1. **Composable:** Create or update composable in `src/composables/`.
2. **Unit Test (AAA):** Write comprehensive unit tests in `src/composables/__tests__/` with `// Arrange`, `// Act`, `// Assert`.
3. **Connect UI:** Wire the composable into the UI component following the UI and Type Safety checklists above.

---

## 7. Cross-Skill Dependencies

To maintain cohesion across the Multistream ecosystem, **you MUST explicitly read these related skills** if you perform any of the following tasks:

- **Modifying Grid, Streams, or Iframes (`StreamGrid.vue`, `useStreams.ts`):** 
  You MUST read `@.agents/skills/graveyard/SKILL.md` before attempting to delete or unmount iframes to prevent catastrophic Mojo crashes.
- **Writing or Updating Tests for Components/Composables:** 
  You MUST read `@.agents/skills/desktop-frontend-testing/SKILL.md` to learn how to properly mock Tauri IPC, isolate state, and structure tests in Vitest.
- **Refactoring or Creating Large Files:** 
  You MUST read `@.agents/skills/code-structure-standards/SKILL.md` to ensure you are applying Clean Code, early returns, and DRY principles correctly.

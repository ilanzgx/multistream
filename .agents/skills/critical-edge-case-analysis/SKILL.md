---
name: multistream-critical-edge-case-analysis
description: Rigorous, egoless methodology for auditing business logic, identifying hidden edge cases, questioning assumptions, remediating logic flaws, and authoring bulletproof unit tests (AAA pattern) across Multistream. Use when asked to review complex business logic, analyze edge cases, audit composables/backend flows, stress-test user journeys, or bulletproof state transitions.
---

# Critical Business Logic & Edge Case Analysis Guide

This guide establishes the mandatory engineering protocol for critically evaluating, stress-testing, and bulletproofing business logic, reactive state transitions, and IPC workflows in Multistream.

---

## 1. Core Philosophy: Egoless & Pragmatic Auditing

1. **Zero Self-Bias ("Egoless Review"):**
   Never assume an implementation is complete or correct just because you wrote it, it compiles, or it passed happy-path checks. Treat any code (your own or existing) with constructive skepticism.
2. **Pragmatic Real-World Thinking:**
   Do not optimize for theoretical edge cases that cannot happen. Focus on real user behavior, realistic async lifecycles, and tangible UI/UX failure modes.
3. **No Overengineering (KISS & DRY):**
   When an edge case or race condition is discovered, resist adding complex layers, convoluted state machines, or unnecessary caches. Fix issues at the root using simple, clean, and reactive logic.
4. **Automated Proof via Unit Tests (AAA Pattern):**
   Every identified edge case MUST be paired with a unit test that verifies the scenario, asserts expected behavior, and prevents future regressions.
5. **Reasoning Must Be Visible:**
   The protocol below is not a mental checklist — it is a sequence of artifacts. Each phase produces written output *before* moving to the next. If you cannot produce the artifact, you have not actually completed the phase; go back and do the work.

---

## 2. The 5-Phase Analysis Protocol

```
[Phase 1: State & Lifecycle Mapping]
               ↓
[Phase 2: Adversarial Edge Case Brainstorming + Risk Ranking]
               ↓
[Phase 3: Critical Code Review & Skepticism]
               ↓
[Phase 4: Minimalist Root-Cause Remediation]
               ↓
        (loop back into Phase 2, applied to the fix itself)
               ↓
[Phase 5: Automated Verification & Unit Tests]
```

**Hard rule:** Do not write or edit implementation code until the Phase 1–3 artifacts below exist in your response. Jumping straight to a fix is exactly how the naive fix in the case study happened.

---

### Phase 1: State & Lifecycle Mapping

Produce a short written map (a table or bullet list is fine) covering:

1. **Inputs & Dependencies:** What composables, props, stores, or IPC endpoints does this logic consume?
2. **State Variables:** List all `ref`, `computed`, and module-level singletons.
3. **Async Triggers:** Identify timers (`setInterval`, `setTimeout`), event listeners (`addEventListener`, `listen`), watchers (`watch`, `watchEffect`), and visibility changes (`visibilitychange`).
4. **Lifecycle Milestones:** Map the flow from component mount (`onMounted`), initial fetch, polling cycles, to teardown (`onScopeDispose`, `onUnmounted`).

This map is the artifact you output — not something you silently infer.

---

### Phase 2: Adversarial Edge Case Brainstorming + Risk Ranking

Systematically evaluate these 6 failure dimensions:

| Dimension | Questions to Ask | Example Scenario |
| :--- | :--- | :--- |
| **1. Fresh / Zero State** | What happens on a clean install with 0 items, no auth, and empty storage? | User opens app for the first time: does it flash empty skeletons or trigger unnecessary API calls? |
| **2. Auth & Session Shifts** | What happens when auth status changes mid-session (login, logout, token expiry)? | User opens app unauthenticated, then logs in 5 minutes later: does the UI reactively load new data? |
| **3. Temporal & Dynamic Updates** | What happens when the user adds/removes items *after* the initial load? | User adds their first favorite channel minutes after startup: does it properly trigger status checks and UI feedback? |
| **4. Background vs Foreground Interference** | Does background polling or revalidation cause layout shifts or UI flicker? | Background interval ticks every 30s: does it flash full-page skeleton loaders or overwrite local edits? |
| **5. Partial / Out-of-Order Resolution** | What if Item A resolves immediately, but Item B fails or hangs? | One stream's API fails with 500 while another succeeds: does the error break the entire list? |
| **6. Teardown & Leak Prevention** | Are all timers, listeners, and abort controllers cleaned up? | User navigates away or closes dialog: do background intervals keep ticking or leak memory? |

For every edge case you find, output a row with:

| Edge Case | Dimension | Probability (H/M/L) | Impact (H/M/L) | Verdict |
| :--- | :--- | :--- | :--- | :--- |

- **Verdict** is one of: `Fix now` (High/High or High impact regardless of probability), `Fix if cheap` (Medium/Medium), or `Document, don't fix` (Low/Low — note it in a comment so the next person doesn't rediscover it from scratch).
- This ranking is what keeps you from over-engineering: not every theoretical edge case earns a code change, but every one earns a decision.

---

### Phase 3: Critical Code Review & Skepticism

Inspect the code line-by-line looking for common architectural anti-patterns, and **quote the specific line(s)** responsible for each `Fix now` / `Fix if cheap` edge case from Phase 2:

- **Static Boolean Traps:** Relying on a single `hasLoadedOnce = true` flag that never resets when relevant dependencies change (like auth or favorites).
- **Overly Broad Loading Conditions:** Combining background revalidation (`isChecking`) with initial loading (`isLoading`) inside full-screen skeleton checks (`v-if="isLoading && items.length === 0"`).
- **Missing Optional Chaining / Fallbacks:** Accessing properties of potentially uninitialized async state (e.g., `statuses.value[key].isLive` without checking `statuses.value[key]`).
- **Unsafe Watchers:** Watching only one trigger when state depends on a combination of sources (e.g., watching `auth` but ignoring `favorites.length`).

Then, red-team the code as it stands: **"If I were trying to break this on purpose, what sequence of user actions would I take?"** Write out that sequence explicitly (e.g., "1. Open app logged out. 2. Add a favorite within the first 500ms, before the initial fetch resolves. 3. Log in while the fetch is still pending."). This adversarial-sequence exercise routinely surfaces race conditions that dimension-by-dimension brainstorming misses, because it forces you to think in terms of ordering, not just states.

---

### Phase 4: Minimalist Root-Cause Remediation

Refactor the logic to handle all `Fix now` and `Fix if cheap` edge cases cleanly:

1. **Separate Concerns:**
   - Use `isInitialLoading` exclusively for first-load skeletons.
   - Use `isLoading` or `isRefreshing` for non-intrusive indicators (spinning icons, progress bars).
2. **Dynamic State-Driven Checks:**
   Instead of brittle one-time booleans, compute readiness dynamically based on the actual presence of data:
   ```typescript
   // Example: dynamically detect if any favorite has an unchecked status
   const hasUncheckedFavorites = computed(() => {
     if (favorites.value.length === 0) return false;
     return favorites.value.some(
       (f) => statuses.value[`${f.platform}:${f.channel.toLowerCase()}`] === undefined
     );
   });
   ```
3. **Preserve Public API Contracts:** Ensure changes do not break existing component consumers or composable interfaces.

**Mandatory re-entry into Phase 2:** Once the fix is written, treat it as new, unreviewed code. Re-run the 6-dimension table against the fix itself and re-run the red-team question from Phase 3 against it. This is not optional — the case study below exists precisely because a fix was shipped without this step. Only proceed to Phase 5 once a pass over the fix produces no new `Fix now` items.

---

### Phase 5: Automated Verification & Unit Tests (AAA Pattern)

Every `Fix now` and `Fix if cheap` edge case must be covered by an automated unit test in `src/composables/__tests__/` or `src/lib/__tests__/`.

#### Unit Test Checklist:
1. **AAA Pattern:** Structure each test clearly with `// Arrange`, `// Act`, `// Assert`.
2. **Fresh Install Test:** Verify state is clean and no premature loading/errors occur with 0 items.
3. **Dynamic Transition Test:** Simulate adding items or logging in *after* initialization.
4. **Background Non-Interference Test:** Verify background polling does not trigger initial loading flags.
5. **Adversarial Sequence Test:** Encode the red-team sequence from Phase 3 as a test, not just the static states.
6. **Type Safety & Build Check:** Always run `bun run desktop:typecheck` and `bun run desktop:test`.

---

## 3. Real-World Case Study: `useFollowedChannels`

### The Problem
Background polling in `useLiveStatus` ran every 30s setting `isChecking = true`. Because `useFollowedChannels` combined `isChecking` into `isLoading`, new users with 0 live channels experienced a flashing skeleton loader every 30 seconds.

### Naive Fix vs Critical Edge-Case Solution

#### ❌ Naive Fix (Introduced an Edge Case):
```typescript
// Added a static boolean flag
const hasLoadedOnce = ref(false);

const isInitialLoading = computed(() => {
  if (hasLoadedOnce.value) return false;
  if (!twitchAuthenticated.value && favorites.value.length === 0) return false;
  return isFetchingTwitch.value || isChecking.value;
});
// FLAW: If an unauthenticated user adds their first favorite 10 minutes later,
// hasLoadedOnce was ALREADY true from startup, so no loading state was shown!
```

This is exactly the failure the mandatory Phase 4 → Phase 2 loop is designed to catch: the naive fix passed a first read of the 6 dimensions but broke on dimension 3 (Temporal & Dynamic Updates) once re-examined as its own artifact.

#### ✅ Critical Edge-Case Solution (Dynamic & Robust):
```typescript
// Detects whether actual data is pending verification
const hasUncheckedFavorites = computed(() => {
  if (favorites.value.length === 0) return false;
  return favorites.value.some(
    (f) => (f.platform === "twitch" || f.platform === "kick") &&
           statuses.value[`${f.platform}:${f.channel.toLowerCase()}`] === undefined
  );
});

const isInitialLoading = computed(() => {
  // 1. Initial Twitch follow fetch when logged in
  if (twitchAuthenticated.value && !hasLoadedTwitchOnce.value && isFetchingTwitch.value) {
    return true;
  }
  // 2. Initial status check for newly added/unverified favorites
  if (hasUncheckedFavorites.value && (isChecking?.value ?? false)) {
    return true;
  }
  return false;
});
```

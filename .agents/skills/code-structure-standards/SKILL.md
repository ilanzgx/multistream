---
name: multistream-code-structure-standards
description: "Rigorous, judgment-driven refactoring protocol for TypeScript, Vue, and Rust in Multistream. Applies Clean Code, DRY, and readability rules with objective triggers, explicit exceptions, and mandatory proof that behavior didn't change. Use when asked to organize, refactor, clean up, or make code readable/maintainable — not for cosmetic-only requests like renaming a single variable."
---

# Code Structure Standards (Multistream)

## Philosophy

Code is read far more often than it's written. In Multistream, we favor **readability, modularity, and explicit intent** over clever one-liners or God Functions — but readability rules are heuristics, not laws. A rule applied without judgment can make code *worse*: an early return that skips cleanup, an extracted "shared" helper that accidentally couples two things that only looked similar, a `computed` that hides a genuinely complex piece of business logic behind an innocent-looking name.

This skill is a **protocol**, not a checklist of things to always do. Every rule below comes with the condition under which it does NOT apply. If you find yourself applying a rule mechanically without checking its exception clause, stop — that's the sign you're pattern-matching instead of reading the code.

---

## The 5-Phase Refactor Protocol

```
[Phase 0: Scope Lock]
        ↓
[Phase 1: Objective Diagnosis]
        ↓
[Phase 2: Rule Application (with exceptions)]
        ↓
[Phase 3: Behavioral Equivalence Proof]
        ↓
[Phase 4: Cross-Skill Handoff]
```

### Phase 0: Scope Lock

Before touching anything, state explicitly what is in scope and what is not:

- If the user asked to refactor a specific function/component/module, refactor *that* — not neighboring code that also looks messy, even if it's tempting.
- If you notice something out-of-scope that genuinely needs cleanup, **name it in your response as a suggestion** ("I also noticed `X` has the same duplication — want me to touch that too?") rather than silently including it in the diff.
- Exception: if the requested refactor is literally impossible to do cleanly without a small out-of-scope touch (e.g., extracting a helper that must be exported from a shared file), that's in scope — but call it out explicitly as a necessary side-touch.

Uncontrolled scope creep is the most common way "readability refactors" turn into 40-file diffs nobody can review properly.

---

### Phase 1: Objective Diagnosis

Replace "this looks messy" with measurable triggers. Don't apply Phase 2 rules unless at least one objective trigger below is actually met — this is what keeps the skill from over-firing on code that's merely unfamiliar rather than actually bad.

| Smell | Objective trigger (not vibes) |
|---|---|
| God Function | Function body > ~40 lines **AND** contains 2+ logically independent blocks that don't share local variables (a clear sign they're separate concerns stitched together) |
| Deep nesting | 3+ levels of `if`/`match`/loop nesting where the innermost block is the "real" logic |
| Avoidable `else` | An `if/else` (or `if/else if/else` chain) exists where the branches are asymmetric (one is a precondition/failure case, not a true alternative outcome) — see 1.4 for when this does NOT apply |
| Duplication worth abstracting | The same shape of loop/condition appears **3+ times** with only the data varying (2 occurrences is often still fine — DRY-ing too early creates a bad abstraction before you know the real shared shape) |
| Broad `try/catch` | A `try` block spans more than the actual fallible I/O/async call — i.e., it also wraps pure, non-throwing logic |
| Template logic leak | `.filter()/.map()/.sort()` or a multi-branch ternary appears inline inside `<template>` |
| `script setup` disorganization | Imports, props/emits, state, computed, methods, and watchers are interleaved rather than grouped |
| Rust `.clone()` overuse | `.clone()` appears on a value used only once afterward, where a borrow or move would work — this is the "clone to make the borrow checker happy" anti-pattern, not a deliberate ownership decision |
| Rust panics in prod paths | `.unwrap()`/`.expect()` on a `Result`/`Option` that came from I/O, parsing, or any Tauri command — not test code or a genuinely infallible invariant |

If none of these are met, say so and don't refactor just to produce a diff.

---

### Phase 2: Rule Application (With Exceptions)

## 1. Core Principles (All Languages)

### 1.1 The Bouncer Pattern (Early Returns)
Handle failures, edge cases, and preconditions at the top of the function; keep the happy path unindented at the bottom.

**Bad:**
```typescript
function process(data: Data) {
  if (data !== null) {
    if (data.isValid) {
      // 50 lines of logic...
    }
  }
}
```

**Good:**
```typescript
function process(data: Data) {
  if (!data || !data.isValid) return;
  // 50 lines of logic...
}
```

**Exception:** if the function has cleanup that must run regardless of the branch taken (releasing a lock, clearing a timer, closing a resource), an early return can *skip* that cleanup. In that case either keep the guard nested inside a `try/finally` (or Rust's RAII drop scope) or make the cleanup itself unconditional at the top of a `finally`/`defer`-equivalent block — don't flatten past a point where flattening silently drops a side effect.

### 1.2 Single Responsibility (Break Down God Functions)
Only split a function once Phase 1's objective trigger is met (2+ logically independent blocks, not sharing local state). Name each extracted helper after what it does, not how ("exportViaLocalDisk" not "helper1").

**Exception:** don't split a function whose "multiple steps" are actually one sequential algorithm where the steps only make sense in that order and are never reused or tested independently (e.g., a specific parsing state machine). Splitting that into 5 one-call helpers can make the algorithm *harder* to follow, not easier — you'd be optimizing for a metric (function length) instead of the actual goal (comprehension).

### 1.3 DRY & Generics
Once the same loop/condition shape appears 3+ times, abstract it into a pure, typed helper.

**Exception:** two pieces of code that look identical today but represent conceptually different rules (e.g., deduplicating favorites by `platform:channel` vs deduplicating search results by a fuzzy-matched title) will likely diverge later. Merging them into one shared helper couples their futures together. Prefer duplication over a wrong abstraction — you can always merge later once you're sure they're really the same rule, but un-merging a wrongly-shared abstraction later is expensive and risky.

### 1.4 Prefer Avoiding `else` (Recommendation, Not Elimination)
When a branch's condition can instead be handled as a guard clause / early return, prefer that over an `if/else`. This is a natural extension of the Bouncer Pattern (1.1): each `else` is one more level of implicit nesting the reader has to hold in their head, even when the code isn't visually indented.

**Prefer:**
```typescript
function getDiscount(user: User): number {
  if (!user.isSubscriber) return 0;
  if (user.tier === "gold") return 0.2;
  return 0.1;
}
```

**Over:**
```typescript
function getDiscount(user: User): number {
  if (!user.isSubscriber) {
    return 0;
  } else {
    if (user.tier === "gold") {
      return 0.2;
    } else {
      return 0.1;
    }
  }
}
```

```rust
// Prefer
fn tier_label(tier: &Tier) -> &'static str {
    if *tier == Tier::Free {
        return "free";
    }
    if *tier == Tier::Gold {
        return "gold";
    }
    "standard"
}
// (or, better still in Rust specifically: reach for `match` over chained
// if/else entirely once there are 3+ branches on the same value — see below)
```

**This is a "when possible" preference, not a rule to enforce mechanically — do not strip every `else` on sight.** It does not apply, and `else` (or `match`) is the *better* choice, when:

- **Both branches are symmetric and equally weighted** — e.g., `if (isDarkMode) { applyDarkTheme() } else { applyLightTheme() }`. Rewriting this as two early returns from a void function, or splitting into two separate top-level conditionals, doesn't reduce nesting — it just removes the visual pairing that tells the reader "these two outcomes are the complete set of possibilities." Keep the `else` here; it's documentation of exhaustiveness.
- **The branches share trailing logic after the conditional** — converting to early returns would force duplicating that trailing logic in both branches, which trades one problem (nesting) for a worse one (duplication, see 1.3).
- **Rust `match` on an enum, especially with 3+ variants:** don't manually convert a `match` into a chain of `if/else`. `match` is exhaustiveness-checked by the compiler — the moment a new enum variant is added, an `if/else` chain silently does nothing for it, while `match` forces a compile error until the new variant is handled. This is a case where "avoid `else`" should be satisfied by `match`, not by chained `if let`.
- **A function returns a boolean and the condition itself already reads as a predicate** — e.g., `return user.age >= 18 && user.hasConsent;` is clearer than an `if/else` returning `true`/`false` literals. Don't introduce a guard-clause `if` here either; this isn't an `else` problem, it's a "don't wrap a boolean expression in control flow" problem.

The test to apply: would removing the `else` make the *set of outcomes* less obvious to the reader, or just move the same logic to a different line? If it's the latter, remove it; if it's the former, keep it.

---

## 2. TypeScript & Composables (`useSomething.ts`)

- **State Grouping:** keep `ref`/`reactive` declarations together at the top.
- **Deduplication:** use expressive pure helpers (`deduplicateBy<T>`) instead of inline `for` + `new Map()`.
- **Try/Catch Scoping:** scope `try/catch` strictly to the fallible I/O/async call, not the whole function body — this also makes it obvious at a glance which specific line can actually throw.

```typescript
const deduplicateBy = <T>(items: T[], keyFn: (item: T) => string): T[] => {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
};

favorites.value = deduplicateBy(
  [...currentFavorites, ...newFavorites],
  (f) => `${f.platform}:${f.channel}`
);
```

**Additional technical detail — async/reactive interaction:**
- When extracting a `try/catch` around an `await`, check whether the code after the `await` reads reactive state that could have changed *while the await was pending* (a common source of Vue race conditions this skill's sibling, `multistream-critical-edge-case-analysis`, is built to catch). A readability refactor that reorders code around an `await` can inadvertently change this window — verify it didn't.
- Prefer `satisfies` over `as` when narrowing a literal for type safety without widening it — `as` silences the checker, `satisfies` keeps inference intact.
- For generic helpers like `deduplicateBy`, constrain the generic (`<T extends { id: string }>`) instead of accepting `unknown` and casting inside — push the type safety to the call site, not the helper's internals.

---

## 3. Vue 3 Components (`.vue`)

**`<script setup>` Organization** (in order):
1. Imports (`vue`, composables, components)
2. Types / Interfaces
3. Props & Emits (`defineProps`, `defineEmits`)
4. Local State (`ref`, `reactive`)
5. Computeds (derived state)
6. Methods / Actions
7. Watchers & Lifecycles (`watch`, `onMounted`)

**Template Logic Extraction:** never put `.filter()/.map()` chains or heavy ternaries inline in `<template>` — extract to a `computed`.

**Bad:**
```vue
<template>
  <div v-for="user in users.filter(u => u.active && u.age > 18).sort((a,b) => a.name.localeCompare(b.name))">
</template>
```

**Good:**
```vue
<script setup>
const activeAdultUsers = computed(() => {
  return users.value
    .filter(u => u.active && u.age > 18)
    .sort((a, b) => a.name.localeCompare(b.name));
});
</script>

<template>
  <div v-for="user in activeAdultUsers" :key="user.id">
</template>
```

**Additional technical detail:**
- Extracting inline template logic into a `computed` is not purely cosmetic: a `computed` is cached and only re-evaluates when its reactive dependencies change, while inline template expressions re-run on *every* render. For a `.filter().sort()` over a large list (e.g., channel lists), this is a real performance improvement, not just a style preference — worth mentioning to the user as a side benefit, not just readability.
- When grouping "Watchers & Lifecycles" last, check whether a `watch` was relying on declaration order relative to a `ref` it closes over — reordering is almost always safe in Vue's Composition API since refs are hoisted by JS scoping, but verify no watcher was accidentally relying on an `immediate: true` firing before a later computed was defined.
- If a component has more than ~3 `watch` calls, consider whether some of them are really reacting to the same underlying trigger and could be merged into one `watch` on an array of sources (`watch([a, b], ...)`) — this is a Phase 1-style DRY trigger specific to Vue.

---

## 4. Rust Backend (`src-tauri/`)

**The `?` Operator (Error Propagation):** avoid nested `match` pyramids for `Result<T, E>`; bubble errors with `?`.

**Bad:**
```rust
fn load_config() -> Result<Config, Error> {
    match fs::read_to_string("config.json") {
        Ok(data) => match serde_json::from_str(&data) {
            Ok(config) => Ok(config),
            Err(e) => Err(e.into()),
        },
        Err(e) => Err(e.into()),
    }
}
```

**Good:**
```rust
fn load_config() -> Result<Config, Error> {
    let data = fs::read_to_string("config.json")?;
    let config: Config = serde_json::from_str(&data)?;
    Ok(config)
}
```

**Surgical Mutability:** only use `mut` when genuinely reassigning; prefer shadowing or chained iterator adapters (`.iter().filter().collect()`) over mutable accumulator loops.

**Tauri Commands:** keep `#[tauri::command]` functions thin — argument parsing and serialization only. Delegate business logic to plain, independently testable Rust functions/structs in separate modules (testable without spinning up Tauri's runtime).

**Additional technical detail — beyond what the original skill covered:**

- **Custom error enums over `.into()` blanket conversion:** `?` bubbling errors via a blanket `From<io::Error> for Error` is convenient but loses context about *which* operation failed. Prefer a `thiserror`-based enum so the caller (and the eventual Tauri command's JSON error payload sent to the frontend) can distinguish failure modes:
  ```rust
  #[derive(Debug, thiserror::Error)]
  enum ConfigError {
      #[error("failed to read config file: {0}")]
      Io(#[from] std::io::Error),
      #[error("config file is not valid JSON: {0}")]
      Parse(#[from] serde_json::Error),
  }
  ```
  This matters specifically because a `#[tauri::command]` error often gets serialized and shown to the user — "config file is not valid JSON" is actionable; a generic "IO error" is not.

- **`.clone()` discipline:** flag every `.clone()` introduced or touched during a refactor and ask "is this value used again after this point, or is this a clone-to-satisfy-the-borrow-checker reflex?" If it's the latter, check whether restructuring the function to move ownership once, or borrowing (`&T`) instead of taking ownership in the callee's signature, avoids the clone entirely. Not all clones are bad — cloning a small `Copy`-adjacent struct once is often clearer than fighting the borrow checker with lifetimes — but a clone inside a hot loop (e.g., inside the 30s polling/status-check path) deserves scrutiny.

- **`unwrap()`/`expect()` audit:** any `.unwrap()`/`.expect()` reachable from a `#[tauri::command]` is a potential full-process panic surfaced to the user as a crash rather than a handled error. During a readability refactor, if you touch a function containing one of these, flag it even if fixing it is out of scope — this is exactly the kind of out-of-scope observation Phase 0 says to surface rather than silently fix.

- **Module boundaries:** when splitting a God Function in Rust, prefer placing the extracted logic in a module that reflects a domain boundary (`platform::twitch`, `platform::kick`) rather than a generic `utils.rs` — Rust's module system makes `pub(crate)` visibility a real tool for enforcing that only the intended callers can reach internal helpers; a readability refactor is a good moment to also tighten visibility from `pub` to `pub(crate)` where nothing outside the crate actually needs it.

---

### Phase 3: Behavioral Equivalence Proof

A readability refactor that changes behavior is a bug, not a refactor. Before presenting the diff as done:

1. **Run typecheck and the existing test suite** (`bun run desktop:typecheck`, `bun run desktop:test`, and the Rust equivalent `cargo check` / `cargo test` for backend changes) and confirm they pass.
2. **If the touched code has no test coverage**, say so explicitly rather than presenting the refactor as verified — "no existing tests cover this path; recommend adding one before merging" is an honest and useful statement, silence is not.
3. **For early-return / control-flow changes specifically**, manually trace at least one case that used to hit the deepest nested branch and confirm it still produces the same outcome post-refactor — this is the highest-risk category for silently changing behavior.
4. **For extracted shared helpers**, confirm every call site was intended to share the exact same behavior — a passing typecheck does not prove semantic equivalence, only structural compatibility.

---

### Phase 4: Cross-Skill Handoff

A structural refactor often invalidates work done by this repo's other skills. Before finishing:

- If the refactor changed a composable's **public return shape, side effects, or contract**, flag that `docs/composables/<name>.md` (from `code-markdown-doc-generator`) is now stale and should be regenerated — don't regenerate it yourself unless asked, just flag it.
- If the refactor changed **error handling, control flow, or added/removed a side effect** in code that was previously audited by `multistream-critical-edge-case-analysis`, flag that the edge-case analysis for that unit should be re-run — a refactor is new, unreviewed code from that skill's perspective, same as any other change.
- Don't perform the other skills' work inline here; just surface the handoff so the user (or the next agent invocation) can act on it.

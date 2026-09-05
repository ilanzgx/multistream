# Scripts

Internal tooling for version synchronization, third-party health checks, and localization.

All scripts run with [Bun](https://bun.sh).

## Overview

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `i18n.ts` | `bun run i18n <cmd>` | Manage translations across all 10 locale files |
| `check-endpoints.ts` | `bun run check:endpoints` | Validate external streaming APIs, embeds, and CDNs |
| `sync-version.ts` | `bun run version <version>` | Bump version across root, desktop, website, and Tauri |

---

## i18n.ts

CLI for inspecting, updating, sorting, and validating parity across the 10 JSON files in `apps/desktop/src/i18n/locales/`.

It uses Bun native file APIs (`Bun.file`, `Bun.write`), preserves each file's line endings (`\r\n` on Windows, `\n` on Linux), and skips writes when the serialized content matches disk.

### Commands

#### 1. Check parity
Compares all 9 non-English files against `en.json` to verify that every key matches and no translations are empty.

```bash
bun run i18n:check
# or
bun run scripts/i18n.ts check
```

Exit code: `0` on parity, `1` if keys are missing or extra.

#### 2. Inspect a key
Prints the current value of a key path across all 10 locales.

```bash
bun run i18n get onboarding.step1.title
```

Exit code: `0` if found in at least one locale, `1` if missing everywhere.

#### 3. Update or insert a key
Updates translations for specified languages. Use `--all` to supply a default fallback for every language at once.

```bash
# Set specific locales with a general fallback
bun run i18n set nav.help --en "Help" --pt "Ajuda" --all "Help"

# Update single locale
bun run i18n set nav.help --es "Ayuda"
```

Supported flags: `--en`, `--pt`, `--es`, `--de`, `--cn`, `--ru`, `--fr`, `--tr`, `--hi`, `--id`, `--all`.

Safeguards:
- Unknown flags (like `--english` or `--br`) immediately halt with exit code 1.
- Path collisions are blocked: you cannot overwrite an existing object group with a string, or nest a child key under an existing string.
- Keys containing `__proto__`, `constructor`, or `prototype` are rejected.

#### 4. Delete a key
Removes a key across all 10 locales and automatically deletes any empty parent objects left behind.

```bash
bun run i18n delete nav.oldLink
```

#### 5. Alphabetical sort
Sorts keys alphabetically across all 10 locale files.

```bash
bun run i18n:sort
```

#### 6. Batch update
Applies multiple key updates from a JSON file.

```bash
bun run i18n batch path/to/updates.json
```

Expected JSON structure:
```json
{
  "nav.help": {
    "en": "Help",
    "pt": "Ajuda",
    "all": "Help"
  }
}
```

### Unit Tests
The underlying tree algorithms and argument parser are tested via Vitest:

```bash
bun run i18n:test
```

---

## check-endpoints.ts

Performs health checks on 17 external HTTP endpoints used by Multistream:
- Twitch GQL, Kick API v1/v2, 7TV, BTTV, Adamcy, and DecAPI
- Twitch, Kick, and YouTube player and chat embeds
- Twitch, Kick, and YouTube emote and badge CDNs

```bash
bun run check:endpoints
```

Use this script before releases or during debugging to detect whether third-party platforms changed their embed URLs or rate-limited our requests.

---

## sync-version.ts

Keeps the release version in sync across five configuration files in the repository:
1. Root `package.json`
2. `apps/desktop/package.json`
3. `apps/website/package.json`
4. `apps/desktop/src-tauri/tauri.conf.json`
5. `apps/desktop/src-tauri/Cargo.toml`

```bash
bun run version 0.19.0
```

Validates that a version argument was passed, updates all five files, and prints a confirmation.

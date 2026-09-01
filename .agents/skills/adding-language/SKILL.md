---
name: multistream-adding-language
description: Guides agents and developers through the exact process of adding a new language to the Multistream application. Use this whenever the user wants to add support for a new language, translate the app, or add a new locale.
---

# Adding a New Language to Multistream

This guide details the exact steps required to introduce a new language into the Multistream desktop application. Follow these steps meticulously to ensure parity, prevent build errors, and maintain correct API behaviors.

## 1. Download the Flag Icon
Go to [UXWing Flag Search](https://uxwing.com/?s=flag) and download the `.svg` flag icon for the corresponding country.

## 2. Create the Flag Component
In `apps/desktop/src/components/icons/flags/`, create a new Vue component for the flag (e.g., `FranceFlagIcon.vue`). 

**CRITICAL:** When pasting the SVG into the `<template>`, you **MUST** convert all CSS classes (e.g., `<style><![CDATA[ .st0{fill:#FF0000;} ]]></style>`) into inline attributes directly on the SVG tags (e.g., `<path fill="#FF0000" ...>`). Completely remove the `<style>` tag. If you leave a `<style>` tag inside the SVG component, Vite will throw a side-effect compilation error.

## 3. Export the Flag Component
Export your new flag component in `apps/desktop/src/components/icons/flags/index.ts`.

## 4. Create the Locale JSON
Create a new JSON file for the language in `apps/desktop/src/i18n/locales/` (e.g., `fr.json`). 
Translate all keys present in `en.json`. The automated parity test in `keys.spec.ts` will automatically validate if any keys are missing.

## 5. Export and Register the Locale JSON
Export the new JSON file in `apps/desktop/src/i18n/locales/index.ts`.
Then, open `apps/desktop/src/i18n/index.ts` and add the language to the import list, the `supportedLocales` Set, and the `messages` object so `vue-i18n` can recognize it.

## 6. Register the Language in Config
Open `apps/desktop/src/config/i18n.ts` and add the language to the `SUPPORTED_LANGUAGES` object.

**CRITICAL: Map `apiCodes` for Stream Suggestions**
You MUST provide the correct `apiCodes` mapping for both Twitch and Kick within the config object. For example:
```typescript
fr: {
  code: "fr",
  label: "FR",
  name: "Français",
  flag: FranceFlagIcon,
  apiCodes: {
    twitch: "FR",
    kick: { code: "fr", name: "French" }, // Must match Kick's language name exactly
  },
}
```
If you forget to define `apiCodes`, the suggestions feature in `apps/desktop/src/composables/useLiveStatus.ts` will fail to filter streams by the new language properly.

## 7. Register YouTube Trending Locale in Backend Rust
YouTube trending streams are fetched via the Rust backend in `apps/desktop/src-tauri/src/youtube/api.rs`.
Open `api.rs` and add the new language code/prefix to the `get_youtube_locale_meta` matcher:
```rust
"fr" => YoutubeLocaleMeta {
    hl: "fr",
    gl: "FR",
    accept_lang: "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
},
```
- `hl`: The host language parameter for YouTube UI strings.
- `gl`: The geolocation region code for YouTube trending feeds.
- `accept_lang`: The HTTP `Accept-Language` header value.

If omitted, YouTube falls back to English (`en-US`), causing trending recommendations to be non-localized.

## 8. Validate Viewer Count Parsing in Backend Rust
YouTube viewer counts are extracted from localized strings (e.g. `"15K watching"`, `"15 mil assistindo"`, `"10 тыс. зрителей"`, `"1.2万人正在观看"`).
Check `parse_viewer_count` in `apps/desktop/src-tauri/src/youtube/parser.rs`:
- If the new language uses specific abbreviations or non-standard multiplier characters (like `万` for 10,000, or unique million/thousand suffixes), make sure they are handled in `parser.rs`.
- Add test assertions for the new language in `should_parse_various_viewer_count_formats` in `parser.rs`.

## 9. Verification & Quality Assurance
Always execute the following checks after adding a new language:
1. **i18n Key Parity:** `bun run desktop:test -- keys.spec.ts`
2. **TypeScript Validation:** `bun run desktop:typecheck`
3. **Rust Backend Validation:** `cargo check` and `cargo test youtube::parser` (from `apps/desktop/src-tauri/`)

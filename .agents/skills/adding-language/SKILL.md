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

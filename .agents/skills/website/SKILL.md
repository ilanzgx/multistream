---
name: multistream-website
description: Pragmatic architecture guide, Astro SSG setup, Tailwind CSS v4 styling, i18n, Deep Link Gateway, and dynamic GitHub Releases integration for the Multistream landing page in apps/website/. Use when modifying the landing page, adding components, editing i18n dictionaries, or updating site SEO.
---

# Multistream Website Architecture & Scalability Guide (`apps/website/`)

This guide defines practical engineering patterns, project structure, internationalization, and deep-link gateway mechanisms for the static Astro landing page of Multistream.

---

## 1. Directory Structure & Technical Stack

```
apps/website/
├── astro.config.mjs               # Astro SSG config, Tailwind CSS v4 plugin, sitemap & robots-txt
├── package.json                   # Dependencies (@astrojs/sitemap, tailwindcss v4, @vercel/analytics)
├── README.md                      # Architecture overview, local development commands & deep-link explanation
├── public/                        # Static assets (favicons, Windows/Linux/Mac icons)
└── src/
    ├── components/                # Modular UI section components (Astro)
    │   ├── Header.astro           # Language switcher, GitHub & donation links
    │   ├── Hero.astro             # Main title, dynamic platform download modal & deep-link trigger
    │   └── Changelog.astro        # GitHub REST API client-side release release loader
    ├── i18n/                      # Internationalization system
    │   ├── ui.ts                  # Dictionary keys for all supported languages ('en', 'pt-br')
    │   └── utils.ts               # Translation helper useTranslations(lang) & getLangFromUrl(url)
    ├── layouts/                   # Global HTML wrappers
    │   └── Layout.astro           # Meta tags, SEO, Vercel Analytics, Speed Insights & theme script
    ├── pages/                     # Route pages
    │   ├── index.astro            # Root redirect page (detects browser lang & forwards to /en/ or /pt-br/)
    │   └── [lang]/                # Static localized pages
    │       └── index.astro        # Main landing page template rendering Hero, Features & Changelog
    └── styles/
        └── global.css             # Tailwind CSS v4 imports (@import "tailwindcss";)
```

---

## 2. Core Architectural Pillars

### A. Deep Link & OAuth Callback Gateway
- **Problem:** Chat platforms (Discord, Twitter/X, WhatsApp) strip custom protocol URIs (like `multistream://`).
- **Solution:** The website accepts standard HTTPS URLs with query parameters (e.g., `https://usemultistream.vercel.app/?action=share&streams=twitch:gaules`).
- **Execution:** The frontend script in `Hero.astro` parses query params, constructs the `multistream://` protocol link, and triggers browser navigation to open the native Tauri desktop app seamlessly.

---

### B. Dynamic GitHub Release Downloads (No Rebuilds)
- **Problem:** Building static sites on every desktop release is unnecessary maintenance overhead.
- **Solution:** `Hero.astro` and `Changelog.astro` fetch release metadata directly from the GitHub API (`https://api.github.com/repos/ilanzgx/multistream/releases/latest`) on the client side.
- **Download Modal:** Parses asset browser download URLs for `.exe`, `.msi`, `.dmg` (Apple Silicon & Intel), `.deb`, and `.AppImage` binaries dynamically.

---

### C. Zero-JS SSG & Lighthouse Performance
- **Static Output:** Built with Astro static output mode for instant page loads.
- **Vercel Analytics:** Uses `@vercel/analytics/astro` and `@vercel/speed-insights/astro` directly inside `Layout.astro`.
- **FOUC Prevention:** Theme detection runs inline inside `<head>` in `Layout.astro` before DOM paint to prevent dark/light flickering.

---

## 3. Adding New Translations (`src/i18n/`)

When adding any user-facing text to the landing page:

1. Open `src/i18n/ui.ts`.
2. Add the translation key in both `en` and `pt-br` dictionaries:

```typescript
export const ui = {
  en: {
    "new_feature.title": "New Platform Support",
  },
  "pt-br": {
    "new_feature.title": "Suporte a Nova Plataforma",
  },
} as const;
```

3. Consume inside an `.astro` component:

```astro
---
import { getLangFromUrl, useTranslations } from '../i18n/utils';

const lang = getLangFromUrl(Astro.url);
const t = useTranslations(lang);
---

<h2>{t('new_feature.title')}</h2>
```

---

## 4. Development & Build Commands

Run commands from the repository root or inside `apps/website/`:

| Action | Command |
| :--- | :--- |
| **Dev Server** | `bun run dev --filter @multistream/website` |
| **Build Site** | `bun run build --filter @multistream/website` |
| **Type Check** | `bun run check --filter @multistream/website` |
| **Preview** | `bun run preview --filter @multistream/website` |

---

## 5. Pragmatic Quality Checklist

Before committing changes to `apps/website/`:

1. 🌐 **i18n Parity:** Ensure every text key added to `src/i18n/ui.ts` exists in both `en` and `pt-br`.
2. 📐 **Type Check:** Run `bun run check --filter @multistream/website` (`astro check`) to verify zero TypeScript errors in `.astro` and `.ts` files.
3. 📱 **Responsive Design:** Verify layouts on mobile (375px), tablet (768px), and desktop (1280px).
4. ♿ **Accessibility (a11y):** Ensure interactive elements have `aria-label` or focus indicators (`focus-visible`).
5. ⚡ **Zero Console Errors:** Verify that client-side scripts in `Hero.astro` and `Changelog.astro` handle network timeouts gracefully.

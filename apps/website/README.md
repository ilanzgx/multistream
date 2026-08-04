# Multistream Landing Page

This directory contains the official landing page for **Multistream**, built to be extremely lightweight, highly performant, and fully static.

## Technical Architecture

- **Framework:** [Astro](https://astro.build/) for Zero-JS static site generation (SSG).
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) using a utilitarian, minimalist design system.
- **Dynamic Artifacts:** Download links and the changelog are fully dynamic, leveraging client-side fetching from the GitHub REST API (`releases/latest`). This ensures the landing page always points to the latest `.exe`, `.dmg`, `.deb`, and `.AppImage` binaries without requiring rebuilds on every desktop release.
- **Performance:** Achieves 100/100/100 across SEO, Best Practices, and Accessibility in Lighthouse audits.

## Deep Link Gateway

A critical architectural responsibility of this landing page is serving as a **Deep Link Gateway**. 

Many modern communication platforms (like Discord, X/Twitter, WhatsApp) actively block or strip custom URI schemes (e.g., `multistream://`) to prevent malicious protocol execution, rendering them unclickable.

To bypass this restriction seamlessly:
1. Users share a standard, secure HTTPS link pointing to this landing page (e.g., `https://usemultistream.vercel.app/?action=share&streams=twitch:channel`).
2. When a user clicks the link, the Astro frontend parses the query parameters.
3. The page intercepts the payload and automatically redirects the browser to the local `multistream://` protocol.
4. The host operating system prompts the user and launches the native Tauri desktop application directly into the requested state.

## Local Development

| Command | Action |
| :--- | :--- |
| `bun install` | Installs dependencies |
| `bun dev` | Starts local dev server at `localhost:4321` |
| `bun build` | Builds the production static site to `./dist/` |
| `bun preview` | Previews the production build locally |

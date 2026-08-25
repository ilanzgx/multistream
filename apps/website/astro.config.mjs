// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import robotsTxt from "astro-robots-txt";

// https://astro.build/config
export default defineConfig({
  site: "https://usemultistream.vercel.app",
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    sitemap({
      filter: (page) => page !== "https://usemultistream.vercel.app/",
      i18n: {
        defaultLocale: "en",
        locales: {
          en: "en-US",
          "pt-br": "pt-BR",
        },
      },
    }),
    robotsTxt(),
  ],
});

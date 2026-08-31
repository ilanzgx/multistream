import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";
import eslintPluginAstro from "eslint-plugin-astro";
import oxlint from "eslint-plugin-oxlint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "dist-ssr/",
      "apps/desktop/dist/",
      "apps/desktop/coverage/",
      "node_modules/",
      "apps/desktop/src-tauri/",
      "apps/website/.astro/",
      "apps/website/dist/",
      "**/*.local",
      "**/*.log",
      "scripts/sync-version.ts",
      ".github/",
      "apps/desktop/playwright-report/",
      "apps/desktop/test-results/",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  ...eslintPluginAstro.configs.recommended,
  {
    files: ["**/*.vue", "**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.astro"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        parser: tseslint.parser,
        sourceType: "module",
        extraFileExtensions: [".vue", ".astro"],
      },
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "vue/require-default-prop": "off",
    },
  },
  oxlint.configs["flat/recommended"],
  eslintConfigPrettier
);

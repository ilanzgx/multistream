import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";
import oxlint from "eslint-plugin-oxlint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "dist-ssr/",
      "coverage/",
      "node_modules/",
      "src-tauri/",
      "**/*.local",
      "**/*.log",
      "scripts/sync-version.ts",
      ".github/",
      "playwright-report/",
      "test-results/",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["**/*.vue", "**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        parser: tseslint.parser,
        sourceType: "module",
        extraFileExtensions: [".vue"],
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

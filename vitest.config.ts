import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      name: "unit",
      environment: "node",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.spec.ts", "src/**/*.test.ts"],
      pool: "threads",
    },
  }),
);

import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [
      ...configDefaults.exclude,
      "e2e/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
});

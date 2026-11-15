import { defineConfig } from "vitest/config";

// Unit tests for the framework-free logic in lib/. The Playwright suite in
// tests/ is run separately.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});

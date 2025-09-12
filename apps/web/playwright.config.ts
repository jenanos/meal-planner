import { defineConfig } from "@playwright/test";

export default defineConfig({
  webServer: {
    command: "pnpm --filter server dev & pnpm --filter web dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
  testDir: "./tests",
});


import { defineConfig } from "@playwright/test";

// End-to-end tests against a running API, web app and database; see the
// "Ende-til-ende-tester" section of the README for what they need.
export default defineConfig({
  webServer: {
    command: "pnpm --filter server dev & pnpm --filter web dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
  testDir: "./tests",
  // The tests share one user and one household's plan.
  workers: 1,
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:3000",
    // Phone-sized, as the shopping list is used in the store.
    viewport: { width: 390, height: 844 },
    locale: "nb-NO",
    launchOptions: {
      // Set to use a browser that is already installed.
      executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
    },
  },
});

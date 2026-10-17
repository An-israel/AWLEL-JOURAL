import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build backed by the local
// Supabase stack (`npm run db:start`). CI does the same (see ci.yml).
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Admin tests change shared roles (e.g. the last Super Admin check).
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // Admin content tests change shared data; they run in their own project, last.
      testIgnore: /(content-admin|workflow|operations)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
      },
    },
    {
      name: "mobile",
      // Account and admin flows are covered once, on desktop.
      testIgnore: /(auth|users|content-admin|workflow|operations)\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
      },
    },
    {
      name: "admin-content",
      testMatch: /(content-admin|workflow|operations)\.spec\.ts/,
      dependencies: ["chromium", "mobile"],
      fullyParallel: false,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
      },
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: "http://localhost:3000/api/health/live",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

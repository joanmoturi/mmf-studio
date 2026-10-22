import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/pwa.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 30000 },
  use: {
    baseURL: "http://127.0.0.1:3318",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "allow",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "npm start -- --port 3318",
    url: "http://127.0.0.1:3318",
    reuseExistingServer: false,
    timeout: 120000,
  },
});

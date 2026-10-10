import { defineConfig, devices } from "@playwright/test";

// Override with PW_PORT when another checkout/worktree is already serving on the default port.
const PORT = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    // Safari engine with iPhone emulation for the native date input checks
    // (limited to those: this engine is very slow on Windows hosts).
    { name: "iphone-webkit", use: { ...devices["iPhone 13"] }, testMatch: /layout-polish\.spec\.ts/, grep: /date field/ },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

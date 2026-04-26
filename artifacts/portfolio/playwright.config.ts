import { defineConfig } from "@playwright/test";

const E2E_PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [
    ["html", { open: "never" }],
    ["allure-playwright"],
  ],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `PORT=${E2E_PORT} BASE_PATH=/ pnpm run dev`,
    port: E2E_PORT,
    reuseExistingServer: true,
    timeout: 20_000,
  },
});

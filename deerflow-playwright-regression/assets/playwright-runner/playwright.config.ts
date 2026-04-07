import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? process.env.DEERFLOW_E2E_BASE_URL;

if (!baseURL) {
  throw new Error("PLAYWRIGHT_BASE_URL or DEERFLOW_E2E_BASE_URL is required");
}

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  // Serial execution: the live suite writes shared threads and the mock suite
  // uses route stubs that can interfere when tests run concurrently against
  // the same base URL. Keep this false until each test manages its own
  // isolated state.
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["line"],
    ["html", { open: "never" }],
    ["junit", { outputFile: "junit.xml" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});

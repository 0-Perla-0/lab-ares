import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.ARES_FULLSTACK_URL;
if (!baseURL || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseURL))
  throw new Error(
    "ARES_FULLSTACK_URL must explicitly target an isolated localhost stack",
  );
export default defineConfig({
  testDir: "./fullstack",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-fullstack-report", open: "never" }],
  ],
  outputDir: "fullstack-results",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});

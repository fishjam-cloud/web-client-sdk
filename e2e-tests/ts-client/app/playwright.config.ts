import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "../.",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : 3,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "../../../playwright-report/ts-client-e2e",
        open: "never",
      },
    ],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:5173",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    extraHTTPHeaders: {
      Authorization: "Bearer development",
    },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
          // default Google Chrome path on MacOS
          // executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          executablePath:
            "/Users/kamilstasiak/Library/Caches/ms-playwright/chromium-1091/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        },
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "yarn run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },

  globalSetup: "../setup/setupFishjam",
  globalTeardown: "../setup/teardownFishjam",
});

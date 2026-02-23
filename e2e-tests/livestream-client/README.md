# Livestream E2E Tests

This is a lightweight React app for testing WHIP/WHEP livestreaming functionality using the `@fishjam-cloud/ts-client` package.

## Structure

```
livestream-client/
├── src/
│   ├── App.tsx           # Main React app with WHIP/WHEP controls
│   ├── main.tsx          # React entry point
│   └── vite-env.d.ts     # Vite environment types
├── scenarios/            # Playwright test scenarios (to be added)
├── config.ts             # Default WHIP/WHEP URLs
├── index.html            # HTML entry point
├── package.json          # Dependencies and scripts
├── playwright.config.ts  # Playwright configuration
├── tsconfig.json         # TypeScript config for src
├── tsconfig.node.json    # TypeScript config for config files
└── vite.config.ts        # Vite bundler config
```

## Features

The React app provides two main sections:

### Receive (WHEP)

- Input for WHEP URL (default: `http://localhost:4000/whep`)
- Optional token input
- Start/Stop receiving button
- Video player to display received stream
- Connection status and error display

### Publish (WHIP)

- Input for WHIP URL (default: `http://localhost:4000/whip`)
- Required token input
- Start/Stop publishing button
- Video preview showing animated emoji (no camera required!)
- Connection status and error display

## Usage

### Install dependencies

```bash
yarn install
```

### Run dev server

```bash
yarn dev
```

The app will be available at `http://localhost:5174`

### Run tests

```bash
yarn e2e        # Run tests
yarn e2e:ui     # Run tests with Playwright UI
```

### Environment Variables

You can override the default Fishjam base URL using an environment variable:

```bash
VITE_FISHJAM_URL=http://example.com yarn dev
```

## Adding Tests

Create Playwright test files in the `scenarios/` directory. Example:

```typescript
import { test, expect } from "@playwright/test";

test("can receive livestream", async ({ page }) => {
  await page.goto("/");

  await page.fill("#whep-url-input", "http://localhost:4000/whep");
  await page.click("#receive-button");

  await expect(page.locator("#receive-status")).toContainText("Receiving");
});
```

## Notes

- **No camera required!** The app uses a canvas stream with animated emojis instead of `getUserMedia()`
- This makes it perfect for CI/CD environments like GitHub Actions runners
- The canvas shows a bouncing emoji with changing colors and a frame counter
- All inputs are persisted to localStorage for convenience
- The app runs on port 5174 (different from webrtc-client's 5173)
- Uses React 19 and Vite 6 for modern, fast development

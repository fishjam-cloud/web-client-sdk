# Livestream E2E Tests

This is a lightweight React app for testing WHIP/WHEP livestreaming functionality using the `@fishjam-cloud/ts-client` package.

## Structure

```
livestream-client/
├── src/
│   ├── App.tsx           # Main React app with WHIP/WHEP controls
│   ├── main.tsx          # React entry point
│   └── vite-env.d.ts     # Vite environment types
├── scenarios/
│   ├── basic.spec.ts     # Playwright test scenarios
│   └── utils.ts          # Shared test helpers
├── config.ts             # Default WHIP/WHEP URLs
├── index.html            # HTML entry point
├── package.json          # Dependencies and scripts
├── playwright.config.ts  # Playwright configuration
├── tsconfig.json         # TypeScript config for src
├── tsconfig.node.json    # TypeScript config for config files
└── vite.config.ts        # Vite bundler config
```

## Features

The React app provides two main sections. There are no manual URL or token inputs — tokens are fetched automatically via `useSandbox()` and the room name is taken from the `?room=` query parameter (defaulting to `"livestream-e2e"`).

### Receive (WHEP)

- Start/Stop Receiving button
- Video player to display the received stream
- Connection status and error display

### Publish (WHIP)

- Start/Stop Publishing button
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

### Room name

Pass a `?room=<name>` query parameter to target a specific room, e.g. `http://localhost:5174/?room=my-room`. Defaults to `"livestream-e2e"`.

## Notes

- **No camera required!** The app uses a canvas stream with animated emojis instead of `getUserMedia()`
- This makes it perfect for CI/CD environments like GitHub Actions runners
- The canvas shows a bouncing emoji with changing colors and a frame counter
- The app runs on port 5174 (different from webrtc-client's 5173)
- Uses React 19 and Vite 6 for modern, fast development

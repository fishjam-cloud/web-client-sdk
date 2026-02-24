# Livestream E2E Tests

This is a lightweight React app for testing WHIP/WHEP livestreaming functionality using the `@fishjam-cloud/ts-client` package.

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

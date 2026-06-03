import { afterEach, beforeEach } from "vitest";

import { installFakeMediaDevices, type MediaDevicesController } from "./fakeMediaDevices";

/**
 * Installs the fake browser media layer (navigator.mediaDevices + MediaStream)
 * before every test and exposes the controller via `globalThis.__media`.
 *
 * Registered as a vitest setupFile so every spec gets a clean media layer.
 */
declare global {
  // eslint-disable-next-line no-var
  var __media: MediaDevicesController;
}

beforeEach(() => {
  globalThis.__media = installFakeMediaDevices();
});

afterEach(() => {
  globalThis.__media?.restore();
});

export const media = () => globalThis.__media;

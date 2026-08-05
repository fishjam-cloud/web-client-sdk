import { FishjamClient, WebDeviceManager } from "@fishjam-cloud/tsunami";
import { test as base } from "vitest";

import { FishjamService } from "../../app/fishjam.service";
import { installFakeMediaDevices, type MediaDevicesController } from "./fakeMediaDevices";
import { FakeSignallingClient } from "./fakeSignallingClient";

interface Fixtures {
  /**
   * The fake browser media layer (navigator.mediaDevices + global
   * MediaStream). Declared `auto` so it is installed and torn down for EVERY
   * test using this `it`, whether or not the test destructures it.
   */
  media: MediaDevicesController;
  /** A fresh fake signalling client, shared with the `service` fixture. */
  signalling: FakeSignallingClient;
  /**
   * A `FishjamService` owning a real tsunami `FishjamClient` wired to the
   * `signalling` fake and a real `WebDeviceManager` (which runs against the
   * `media` fake). Torn down through `ngOnDestroy`, like Angular would.
   */
  service: FishjamService;
}

// `provide` is vitest's fixture-injection callback (positionally the 2nd arg).
export const it = base.extend<Fixtures>({
  media: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, provide) => {
      const controller = installFakeMediaDevices();
      await provide(controller);
      controller.restore();
    },
    { auto: true },
  ],
  // eslint-disable-next-line no-empty-pattern
  signalling: async ({}, provide) => {
    await provide(new FakeSignallingClient());
  },
  // Depends on `media` so the fake platform is installed before the client
  // (and its device manager) come up.
  service: async ({ media: _media, signalling }, provide) => {
    const service = new FishjamService(
      new FishjamClient({
        signallingClient: signalling.asClient(),
        deviceManager: new WebDeviceManager(),
      }),
    );
    await provide(service);
    service.ngOnDestroy();
  },
});

/** Connects the client through the fake and settles on the joined state. */
export const connectAndJoin = async (service: FishjamService, signalling: FakeSignallingClient): Promise<void> => {
  const connecting = service.client.connect({ url: "wss://fishjam.example/socket", token: "test-token", peerMetadata: {} });
  signalling.simulateJoined();
  await connecting;
};

export { describe, expect, vi } from "vitest";

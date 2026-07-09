import { type RenderHookResult } from "@testing-library/react";
import { test as base } from "vitest";

import { FakeFishjamClient } from "./fakeFishjamClient";
import { installFakeMediaDevices, type MediaDevicesController } from "./fakeMediaDevices";
import { renderHookWithProvider, type RenderHookWithProviderOptions } from "./renderWithProvider";

interface Fixtures {
  /**
   * The fake browser media layer (navigator.mediaDevices + global MediaStream).
   *
   * Declared `auto` so it is installed and torn down for EVERY test using this
   * `it`, whether or not the test destructures it — no global setup file or
   * `globalThis` channel needed.
   */
  media: MediaDevicesController;
  /** A fresh fake client, shared with whatever `renderHook` mounts. */
  client: FakeFishjamClient;
  /**
   * `renderHookWithProvider` pre-wired to the `client` fixture, so a test can
   * mount a hook and drive the same client's events without threading it by hand.
   * A test may still override `providerProps` per call.
   */
  renderHook: <Result, Props>(
    hook: (props: Props) => Result,
    options?: RenderHookWithProviderOptions<Props>,
  ) => RenderHookResult<Result, Props>;
}

// `provide` is vitest's fixture-injection callback (positionally the 2nd arg);
// it is named `provide` rather than the docs' `use` only to dodge the
// react-hooks/rules-of-hooks lint, which mistakes a call to `use(...)` for React.
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
  client: async ({}, provide) => {
    await provide(new FakeFishjamClient());
  },
  renderHook: async ({ client }, provide) => {
    await provide((hook, options) => renderHookWithProvider(hook, client, options));
  },
});

export { afterEach, beforeEach, describe, expect, vi } from "vitest";

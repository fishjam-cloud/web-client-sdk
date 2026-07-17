import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-registers its cleanup when a global `afterEach`
// exists (which it does not here — no `globals: true`). Without this, every
// `renderHook` tree leaks for the whole spec file: listeners stay attached to
// fake clients and references to already-restored media fakes linger, turning
// into order-dependent spy-count pollution and act() flakes as specs grow.
afterEach(() => {
  cleanup();
});

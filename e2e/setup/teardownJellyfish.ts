import { setupState } from "./globalSetupState";

export default async function teardownJellyfish() {
  await setupState.jellyfishContainer?.down();
}

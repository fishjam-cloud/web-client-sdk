import { setupState } from './globalSetupState';

export default async function teardownFishjam() {
  await setupState.fishjamContainer?.down();
}

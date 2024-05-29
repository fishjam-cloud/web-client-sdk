import { StartedDockerComposeEnvironment } from 'testcontainers';

export type SetupState = {
  fishjamContainer: StartedDockerComposeEnvironment | null;
};

export const setupState: SetupState = {
  fishjamContainer: null,
};

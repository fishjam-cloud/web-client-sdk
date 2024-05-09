import { StartedDockerComposeEnvironment } from "testcontainers";

export type SetupState = {
  jellyfishContainer: StartedDockerComposeEnvironment | null;
};

export const setupState: SetupState = {
  jellyfishContainer: null,
};

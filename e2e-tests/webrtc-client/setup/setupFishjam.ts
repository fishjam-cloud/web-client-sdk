import { type NetworkInterfaceInfo, networkInterfaces } from "os";
import { DockerComposeEnvironment, Wait } from "testcontainers";

import { setupState } from "./globalSetupState";

export default async function setupFishjam() {
  const EXTERNAL_IP = Object.values(networkInterfaces())
    .flat()
    .filter((x): x is NetworkInterfaceInfo => x !== undefined)
    .filter(({ family }) => family === "IPv4")
    .filter(({ internal }) => !internal)
    .map(({ address }) => address)[0];

  setupState.fishjamContainer = await new DockerComposeEnvironment(".", "docker-compose-test.yaml")
    .withEnvironment({ EXTERNAL_IP })
    .withWaitStrategy("fishjam", Wait.forLogMessage("Access FishjamWeb.Endpoint at"))
    .up();
}

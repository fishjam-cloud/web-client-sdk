import { Wait, DockerComposeEnvironment } from 'testcontainers';
import { setupState } from './globalSetupState';
import { type NetworkInterfaceInfo, networkInterfaces } from 'os';

export default async function setupFishjam() {
  const EXTERNAL_IP = Object.values(networkInterfaces())
    .flat()
    .filter((x): x is NetworkInterfaceInfo => x !== undefined)
    .filter(({ family }) =>
      typeof family === 'string' ? family === 'IPv4' : family === 4,
    )
    .filter(({ internal }) => !internal)
    .map(({ address }) => address)[0];

  const container = await new DockerComposeEnvironment(
    'e2e',
    'docker-compose-test.yaml',
  )
    .withEnvironment({ EXTERNAL_IP })
    .withWaitStrategy(
      'fishjam',
      Wait.forLogMessage('Access FishjamWeb.Endpoint at'),
    )
    .up();

  setupState.fishjamContainer = container;
}

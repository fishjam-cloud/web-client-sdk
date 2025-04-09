import { WHEPClient } from './whep/whep.js';

type SetupWhepResult = {
  stream: MediaStream;
  stop: () => Promise<void>;
};

export function setupWhep(url: string, token: string) {
  const pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });

  pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.addTransceiver('video', { direction: 'recvonly' });

  const whep = new WHEPClient();

  return new Promise<SetupWhepResult>((resolve) => {
    pc.ontrack = (event) => {
      if (event.track.kind == 'video') {
        const stream = event.streams[0];
        if (stream) resolve({ stream, stop: () => whep.stop() });
      }
    };

    whep.view(pc, url, token);
  });
}

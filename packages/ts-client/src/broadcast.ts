import { WHEPClient } from '@binbat/whip-whep/whep';

export type BroadcastResult = {
  stream: MediaStream;
  stop: () => Promise<void>;
};

export function consumeBroadcast(url: string, token: string) {
  const pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });

  pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.addTransceiver('video', { direction: 'recvonly' });

  const whep = new WHEPClient();

  return new Promise<BroadcastResult>((resolve) => {
    pc.ontrack = (event) => {
      if (event.track.kind == 'video') {
        const stream = event.streams[0];
        if (stream) resolve({ stream, stop: () => whep.stop() });
      }
    };

    whep.view(pc, url, token);
  });
}

import { WHEPClient } from './whep/whep.js';

export function setupWhep(url: string, token: string) {
  //Create peerconnection
  const pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });

  //Add recv only transceivers
  pc.addTransceiver('audio');
  pc.addTransceiver('video');

  //Create whep client
  const whep = new WHEPClient();

  //Start viewing

  return new Promise<MediaStream>((resolve) => {
    pc.ontrack = (event) => {
      if (event.track.kind == 'video') {
        const stream = event.streams[0];
        if (stream) resolve(stream);
      }
    };

    whep.view(pc, url, token);
  });
}

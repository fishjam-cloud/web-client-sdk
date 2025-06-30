import { WHEPClient } from '@binbat/whip-whep/whep';

export type ReceiveLivestreamResult = {
  stream: MediaStream;
  stop: () => Promise<void>;
};

export enum LivestreamError {
  UNAUTHORIZED = 'unauthorized',
  STREAM_NOT_FOUND = 'stream_not_found',
  UNKNOWN_ERROR = 'unknown_error',
}

export function receiveLivestream(url: string, token: string) {
  const pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });

  pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.addTransceiver('video', { direction: 'recvonly' });

  const whep = new WHEPClient();

  return new Promise<ReceiveLivestreamResult>((resolve, reject) => {
    pc.ontrack = (event) => {
      if (event.track.kind == 'video') {
        const stream = event.streams[0];
        if (stream) resolve({ stream, stop: () => whep.stop() });
      }
    };

    whep.view(pc, url, token).catch((e) => {
      if (e instanceof Error) {
        let error = LivestreamError.UNKNOWN_ERROR;
        if (e.message.includes('401')) {
          error = LivestreamError.UNAUTHORIZED;
        } else if (e.message.includes('404')) {
          error = LivestreamError.STREAM_NOT_FOUND;
        }
        reject(error);
      }
    });
  });
}

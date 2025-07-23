import { WHEPClient } from '@binbat/whip-whep/whep';
import { WHIPClient } from '@binbat/whip-whep/whip';

export type ReceiveLivestreamResult = {
  stream: MediaStream;
  stop: () => Promise<void>;
};

export type PublishLivestreamResult = {
  stopPublishing: () => Promise<void>;
};

export enum LivestreamError {
  UNAUTHORIZED = 'unauthorized',
  STREAM_NOT_FOUND = 'stream_not_found',
  UNKNOWN_ERROR = 'unknown_error',
}

export function receiveLivestream(url: string, token?: string) {
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

export async function publishLivestream(
  stream: MediaStream,
  url: string,
  token: string,
): Promise<PublishLivestreamResult> {
  const pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });

  const video = stream.getVideoTracks().at(0);
  const audio = stream.getAudioTracks().at(0);

  if (!video && !audio) {
    throw Error('To publish a livestream with WHIP, you need to supply at least one video or audio track.');
  }

  if (video) pc.addTransceiver(video, { direction: 'sendonly' });
  if (audio) pc.addTransceiver(audio, { direction: 'sendonly' });

  const whip = new WHIPClient();
  try {
    await whip.publish(pc, url, token);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes('401')) throw LivestreamError.UNAUTHORIZED;
      if (e.message.includes('404')) throw LivestreamError.STREAM_NOT_FOUND;
    }
    throw LivestreamError.UNKNOWN_ERROR;
  }

  return { stopPublishing: () => whip.stop() };
}

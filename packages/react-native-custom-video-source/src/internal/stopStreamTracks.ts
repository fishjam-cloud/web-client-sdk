import type { MediaStream } from '@fishjam-cloud/react-native-webrtc';

/** Stops every track of `stream`, downgrading failures to a warning tagged with `ownerLabel`. */
export function stopStreamTracks(stream: MediaStream, ownerLabel: string): void {
  try {
    stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
  } catch (cause) {
    console.warn(`${ownerLabel}: stopping tracks failed`, cause);
  }
}

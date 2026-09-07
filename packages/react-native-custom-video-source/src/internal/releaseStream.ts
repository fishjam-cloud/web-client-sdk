import type { MediaStream } from '@fishjam-cloud/react-native-webrtc';

/**
 * Tears down `stream` natively (every track plus the stream itself), downgrading failures to a
 * warning tagged with `ownerLabel`. `track.stop()` alone only disables a track in JS; releasing
 * is what lets the native capture controller finish and, for pooled tracks, frees the pool.
 */
export function releaseStream(stream: MediaStream, ownerLabel: string): void {
  try {
    stream.release();
  } catch (cause) {
    console.warn(`${ownerLabel}: releasing the stream failed`, cause);
  }
}

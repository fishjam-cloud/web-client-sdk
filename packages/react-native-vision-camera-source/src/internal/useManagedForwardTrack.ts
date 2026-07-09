import {
  createCustomVideoTrack,
  type CustomVideoTrackResult,
  type ForwardTrack,
  type MediaStream,
} from '@fishjam-cloud/react-native-webrtc';
import { useEffect, useState } from 'react';

interface ManagedForwardTrack {
  track: ForwardTrack | null;
  stream: MediaStream | null;
  error: Error | null;
}

const INITIAL_STATE: ManagedForwardTrack = { track: null, stream: null, error: null };

function stopStreamTracks(stream: MediaStream): void {
  try {
    stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
  } catch (cause) {
    console.warn('useManagedForwardTrack: stopping tracks failed', cause);
  }
}

/**
 * Owns the async lifecycle of a forwarding custom video track: creates it while `enabled`,
 * exposes the handle + stream once ready, and stops the tracks on disable/unmount (also when
 * creation resolves after the owner already unmounted).
 */
export function useManagedForwardTrack(enabled: boolean): ManagedForwardTrack {
  const [managedTrack, setManagedTrack] = useState<ManagedForwardTrack>(INITIAL_STATE);

  useEffect(() => {
    // The disabled case needs no work: the previous run's cleanup already reset the state.
    if (!enabled) {
      return;
    }
    let cancelled = false;
    let created: CustomVideoTrackResult<ForwardTrack> | null = null;

    createCustomVideoTrack()
      .then((result) => {
        created = result;
        if (cancelled) {
          stopStreamTracks(result.stream);
          return;
        }
        setManagedTrack({ track: result.track, stream: result.stream, error: null });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setManagedTrack({
            track: null,
            stream: null,
            error: cause instanceof Error ? cause : new Error(String(cause)),
          });
        }
      });

    return () => {
      cancelled = true;
      if (created != null) {
        stopStreamTracks(created.stream);
      }
      setManagedTrack(INITIAL_STATE);
    };
  }, [enabled]);

  return managedTrack;
}

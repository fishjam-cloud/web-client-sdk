import {
  createCustomVideoTrack,
  type CustomVideoTrackResult,
  type ForwardTrack,
  type MediaStream,
} from '@fishjam-cloud/react-native-webrtc';
import { useEffect, useState } from 'react';

import { stopStreamTracks } from './stopStreamTracks';
import { toError } from './toError';

interface ManagedForwardTrack {
  track: ForwardTrack | null;
  stream: MediaStream | null;
  error: Error | null;
}

const INITIAL_STATE: ManagedForwardTrack = { track: null, stream: null, error: null };

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
    // Creation is async, so the effect may be torn down before it resolves. `disposed` records
    // that; `created` holds the result once it exists so cleanup can stop it exactly once.
    let disposed = false;
    let created: CustomVideoTrackResult<ForwardTrack> | null = null;

    createCustomVideoTrack()
      .then((result) => {
        if (disposed) {
          // Torn down while creating — throw the just-built track away.
          stopStreamTracks(result.stream, 'useManagedForwardTrack');
          return;
        }
        created = result;
        setManagedTrack({ track: result.track, stream: result.stream, error: null });
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          setManagedTrack({ ...INITIAL_STATE, error: toError(cause) });
        }
      });

    return () => {
      disposed = true;
      if (created != null) {
        stopStreamTracks(created.stream, 'useManagedForwardTrack');
      }
      setManagedTrack(INITIAL_STATE);
    };
  }, [enabled]);

  return managedTrack;
}

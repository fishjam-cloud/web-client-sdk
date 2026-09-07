import type { MediaStream, PooledTrack } from '@fishjam-cloud/react-native-webrtc';
import { useEffect, useState } from 'react';

import {
  allocatePooledTrack,
  disposeAllocation,
  type PooledTrackAllocation,
  type WorkletBufferDescriptor,
} from './pooledTrackAllocation';
import { toError } from './toError';

export type { WorkletBufferDescriptor } from './pooledTrackAllocation';

/**
 * State of a pooled custom video track managed by {@link useManagedPooledTrack}.
 * While the pool and track are being created (or after an error) all fields are `null`.
 */
export interface ManagedPooledTrack {
  track: PooledTrack | null;
  stream: MediaStream | null;
  /** Plain per-surface descriptors (the pool object itself is not worklet-serializable). */
  bufferDescriptors: WorkletBufferDescriptor[] | null;
  error: Error | null;
}

const INITIAL_STATE: ManagedPooledTrack = { track: null, stream: null, bufferDescriptors: null, error: null };

/**
 * Owns the async lifecycle of a surface pool + pooled custom video track: allocates both while
 * `enabled` (re-allocates when the dimensions change), exposes worklet-ready descriptors, and
 * tears down in the correct order (stop tracks, then dispose the pool) on disable/unmount.
 */
export function useManagedPooledTrack(
  enabled: boolean,
  width: number,
  height: number,
  poolSize: number,
): ManagedPooledTrack {
  const [managedTrack, setManagedTrack] = useState<ManagedPooledTrack>(INITIAL_STATE);

  useEffect(() => {
    // The disabled case needs no work: the previous run's cleanup already reset the state (so
    // consumers never hold descriptors of a disposed pool).
    if (!enabled) {
      return;
    }

    // Allocation is async, so the effect may be torn down before it resolves. `disposed` records
    // that; `allocation` holds the result once it exists so cleanup can free it exactly once.
    let disposed = false;
    let allocation: PooledTrackAllocation | null = null;

    allocatePooledTrack(width, height, poolSize)
      .then((result) => {
        if (disposed) {
          // Torn down while allocating — throw the just-built resources away.
          disposeAllocation(result);
          return;
        }
        allocation = result;
        setManagedTrack({
          track: result.track,
          stream: result.stream,
          bufferDescriptors: result.bufferDescriptors,
          error: null,
        });
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          setManagedTrack({ ...INITIAL_STATE, error: toError(cause) });
        }
      });

    return () => {
      disposed = true;
      if (allocation) {
        disposeAllocation(allocation);
      }
      setManagedTrack(INITIAL_STATE);
    };
  }, [enabled, width, height, poolSize]);

  return managedTrack;
}

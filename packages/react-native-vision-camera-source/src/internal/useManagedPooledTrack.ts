import {
  createCustomVideoBufferPool,
  createCustomVideoTrack,
  type CustomVideoBuffer,
  type CustomVideoBufferPool,
  type MediaStream,
  type PooledTrack,
} from '@fishjam-cloud/react-native-webrtc';
import { useEffect, useState } from 'react';

/** One pooled output surface as plain values the frame worklet can capture and import itself. */
export interface WorkletBufferDescriptor {
  index: number;
  surfaceHandle: bigint;
  width: number;
  height: number;
}

interface ManagedPooledTrack {
  track: PooledTrack | null;
  stream: MediaStream | null;
  /** Plain per-surface descriptors (the pool object itself is not worklet-serializable). */
  bufferDescriptors: WorkletBufferDescriptor[] | null;
  error: Error | null;
}

const INITIAL_STATE: ManagedPooledTrack = { track: null, stream: null, bufferDescriptors: null, error: null };

/** A fully-allocated pool + its track, owned and torn down as a single unit. */
interface PooledTrackAllocation {
  pool: CustomVideoBufferPool;
  track: PooledTrack;
  stream: MediaStream;
  bufferDescriptors: WorkletBufferDescriptor[];
}

function toWorkletBufferDescriptor(buffer: CustomVideoBuffer): WorkletBufferDescriptor {
  return { index: buffer.index, surfaceHandle: buffer.surfaceHandle, width: buffer.width, height: buffer.height };
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function disposePool(pool: CustomVideoBufferPool): void {
  void pool.dispose().catch((cause: unknown) => {
    console.warn('useManagedPooledTrack: disposing the buffer pool failed', cause);
  });
}

/** Tears an allocation down in the required order: stop the track's frames, then free its pool. */
function disposeAllocation({ pool, stream }: PooledTrackAllocation): void {
  try {
    stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
  } catch (cause) {
    console.warn('useManagedPooledTrack: stopping tracks failed', cause);
  }
  disposePool(pool);
}

/** Allocates the surface pool and a track bound to it. If the track fails, frees the orphan pool. */
async function allocatePooledTrack(width: number, height: number, poolSize: number): Promise<PooledTrackAllocation> {
  const pool = await createCustomVideoBufferPool({ width, height, poolSize });
  try {
    const { track, stream } = await createCustomVideoTrack({ pool });
    return { pool, track, stream, bufferDescriptors: pool.buffers.map(toWorkletBufferDescriptor) };
  } catch (cause) {
    disposePool(pool);
    throw cause;
  }
}

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

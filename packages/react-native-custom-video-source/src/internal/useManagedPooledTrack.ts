import {
  createCustomVideoBufferPool,
  createCustomVideoTrack,
  type CustomVideoBuffer,
  type CustomVideoBufferPool,
  type MediaStream,
  type PooledTrack,
} from '@fishjam-cloud/react-native-webrtc';
import { useEffect, useState } from 'react';

import { releaseStream } from './releaseStream';
import { toError } from './toError';

/** One pooled output surface as plain values the frame worklet can capture and import itself. */
export interface WorkletBufferDescriptor {
  index: number;
  surfaceHandle: bigint;
  width: number;
  height: number;
}

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

const POOL_DISPOSE_ATTEMPTS = 10;
const POOL_DISPOSE_RETRY_MILLISECONDS = 100;
const POOL_IN_USE_ERROR_CODE = 'E_CUSTOM_VIDEO_POOL_IN_USE';

function isPoolInUseError(cause: unknown): boolean {
  return (cause as { code?: unknown } | null)?.code === POOL_IN_USE_ERROR_CODE;
}

/**
 * Frees the pool once its track has finished tearing down. Releasing the track is asynchronous
 * on the native side, so the first attempts may still find the track live; those are retried.
 */
async function disposePool(pool: CustomVideoBufferPool): Promise<void> {
  for (let attempt = 1; attempt <= POOL_DISPOSE_ATTEMPTS; attempt += 1) {
    try {
      await pool.dispose();
      return;
    } catch (cause) {
      if (!isPoolInUseError(cause) || attempt === POOL_DISPOSE_ATTEMPTS) {
        console.warn('useManagedPooledTrack: disposing the buffer pool failed', cause);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POOL_DISPOSE_RETRY_MILLISECONDS));
    }
  }
}

/** Tears an allocation down in the required order: release the track, then free its pool. */
function disposeAllocation({ pool, stream }: PooledTrackAllocation): void {
  releaseStream(stream, 'useManagedPooledTrack');
  void disposePool(pool);
}

/** Allocates the surface pool and a track bound to it. If the track fails, frees the orphan pool. */
async function allocatePooledTrack(width: number, height: number, poolSize: number): Promise<PooledTrackAllocation> {
  const pool = await createCustomVideoBufferPool({ width, height, poolSize });
  try {
    const { track, stream } = await createCustomVideoTrack({ pool });
    return { pool, track, stream, bufferDescriptors: pool.buffers.map(toWorkletBufferDescriptor) };
  } catch (cause) {
    void disposePool(pool);
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

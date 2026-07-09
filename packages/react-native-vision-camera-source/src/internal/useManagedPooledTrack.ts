import {
  createCustomVideoBufferPool,
  createCustomVideoTrack,
  type CustomVideoBufferPool,
  type CustomVideoTrackResult,
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

function disposeCreated(pool: CustomVideoBufferPool | null, created: CustomVideoTrackResult<PooledTrack> | null): void {
  // Stop the track first, then free the pool — the pool must outlive the track's last frame.
  try {
    created?.stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
  } catch (cause) {
    console.warn('useManagedPooledTrack: stopping tracks failed', cause);
  }
  void pool?.dispose().catch((cause: unknown) => {
    console.warn('useManagedPooledTrack: disposing the buffer pool failed', cause);
  });
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
    let cancelled = false;
    let pool: CustomVideoBufferPool | null = null;
    let created: CustomVideoTrackResult<PooledTrack> | null = null;

    (async () => {
      pool = await createCustomVideoBufferPool({ width, height, poolSize });
      if (cancelled) {
        disposeCreated(pool, null);
        return;
      }
      created = await createCustomVideoTrack({ pool });
      if (cancelled) {
        disposeCreated(pool, created);
        return;
      }
      const bufferDescriptors = pool.buffers.map((buffer) => ({
        index: buffer.index,
        surfaceHandle: buffer.surfaceHandle,
        width: buffer.width,
        height: buffer.height,
      }));
      setManagedTrack({ track: created.track, stream: created.stream, bufferDescriptors, error: null });
    })().catch((cause: unknown) => {
      if (!cancelled) {
        setManagedTrack({
          track: null,
          stream: null,
          bufferDescriptors: null,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
      }
      disposeCreated(pool, created);
      pool = null;
      created = null;
    });

    return () => {
      cancelled = true;
      disposeCreated(pool, created);
      setManagedTrack(INITIAL_STATE);
    };
  }, [enabled, width, height, poolSize]);

  return managedTrack;
}

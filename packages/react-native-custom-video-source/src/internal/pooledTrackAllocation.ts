import {
  createCustomVideoBufferPool,
  createCustomVideoTrack,
  type CustomVideoBuffer,
  type CustomVideoBufferPool,
  type MediaStream,
  type PooledTrack,
} from '@fishjam-cloud/react-native-webrtc';

import { releaseStream } from './releaseStream';

/** One pooled output surface as plain values the frame worklet can capture and import itself. */
export interface WorkletBufferDescriptor {
  index: number;
  surfaceHandle: bigint;
  width: number;
  height: number;
}

/** A fully-allocated pool + its track, owned and torn down as a single unit. */
export interface PooledTrackAllocation {
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
export async function disposePool(pool: CustomVideoBufferPool): Promise<void> {
  for (let attempt = 1; attempt <= POOL_DISPOSE_ATTEMPTS; attempt += 1) {
    try {
      await pool.dispose();
      return;
    } catch (cause) {
      if (!isPoolInUseError(cause) || attempt === POOL_DISPOSE_ATTEMPTS) {
        console.warn('pooledTrackAllocation: disposing the buffer pool failed', cause);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POOL_DISPOSE_RETRY_MILLISECONDS));
    }
  }
}

/** Tears an allocation down in the required order: release the track, then free its pool. */
export function disposeAllocation({ pool, stream }: PooledTrackAllocation): void {
  releaseStream(stream, 'pooledTrackAllocation');
  void disposePool(pool);
}

/** Allocates the surface pool and a track bound to it. If the track fails, frees the orphan pool. */
export async function allocatePooledTrack(
  width: number,
  height: number,
  poolSize: number,
): Promise<PooledTrackAllocation> {
  const pool = await createCustomVideoBufferPool({ width, height, poolSize });
  try {
    const { track, stream } = await createCustomVideoTrack({ pool });
    return { pool, track, stream, bufferDescriptors: pool.buffers.map(toWorkletBufferDescriptor) };
  } catch (cause) {
    void disposePool(pool);
    throw cause;
  }
}

/// <reference types="@webgpu/types" />
import { getOutputSurfaceFormat } from '@fishjam-cloud/react-native-custom-video-source/webgpu';
import {
  createCustomVideoBufferPool,
  createCustomVideoTrack,
  type CustomVideoBufferPool,
  type MediaStream,
  type PooledTrack,
  pushFrame,
} from '@fishjam-cloud/react-native-webrtc';
// react-native-webgpu declares GPUDevice.importSharedTextureMemory in a `declare global` block,
// so this import is what makes that method visible, not just the named types.
import { type GPUSharedTextureMemory, GPUTextureUsage } from 'react-native-webgpu';

export interface SyntheticFrameSourceOptions {
  width: number;
  height: number;
  poolSize: number;
  framesPerSecond: number;
}

export interface SyntheticFrameSource {
  /** Publish this, or hand its video track back from a track middleware. */
  stream: MediaStream;
  /** Stops the render loop and frees the pool. Safe to call more than once. */
  stop: () => Promise<void>;
}

interface ImportedSurface {
  /** The pool's own slot index — not this array's position. */
  index: number;
  memory: GPUSharedTextureMemory;
  texture: GPUTexture;
  view: GPUTextureView;
}

/** Full hue sweep every three seconds — unmistakably not a camera. */
function sweepColour(frameIndex: number, framesPerSecond: number): GPUColorDict {
  const angle = ((frameIndex / framesPerSecond) / 3) * Math.PI * 2;
  return {
    r: 0.5 + 0.5 * Math.sin(angle),
    g: 0.5 + 0.5 * Math.sin(angle + (Math.PI * 2) / 3),
    b: 0.5 + 0.5 * Math.sin(angle + (Math.PI * 4) / 3),
    a: 1,
  };
}

function importPoolSurfaces(device: GPUDevice, pool: CustomVideoBufferPool): ImportedSurface[] {
  const format = getOutputSurfaceFormat();
  return pool.buffers.map((buffer) => {
    const memory = device.importSharedTextureMemory({ handle: buffer.surfaceHandle });
    const texture = memory.createTexture({
      format,
      size: [buffer.width, buffer.height],
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // A GPUTextureView has no release API, so build it once per slot rather than per frame.
    return { index: buffer.index, memory, texture, view: texture.createView() };
  });
}

function renderClearedFrame(device: GPUDevice, surface: ImportedSurface, clearValue: GPUColorDict) {
  surface.memory.beginAccess(surface.texture, false);
  let accessResult;
  try {
    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: surface.view, loadOp: 'clear', clearValue, storeOp: 'store' }],
    });
    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
  } finally {
    // Leaving a slot acquired after a throw would poison it for every later frame.
    accessResult = surface.memory.endAccess(surface.texture);
  }
  return accessResult.fences[0];
}

/**
 * S0-A: a pooled custom video track fed an animated colour from the JS thread — no camera, no
 * worklets. Exists only to prove that a track handed back from the camera middleware becomes
 * `peer.cameraTrack` locally and for remote peers.
 */
export async function startSyntheticFrameSource(
  device: GPUDevice,
  options: SyntheticFrameSourceOptions,
): Promise<SyntheticFrameSource> {
  const { width, height, poolSize, framesPerSecond } = options;

  const pool = await createCustomVideoBufferPool({ width, height, poolSize });
  let track: PooledTrack;
  let stream: MediaStream;
  try {
    ({ track, stream } = await createCustomVideoTrack({ pool }));
  } catch (cause) {
    await pool.dispose();
    throw cause;
  }

  const surfaces = importPoolSurfaces(device, pool);
  const frameIntervalNanoseconds = Math.round(1_000_000_000 / framesPerSecond);
  let timestampNanoseconds = Date.now() * 1_000_000;
  let frameIndex = 0;
  let consecutiveFailures = 0;

  const timer = setInterval(() => {
    const surface = surfaces[frameIndex % surfaces.length];
    try {
      const fenceState = renderClearedFrame(device, surface, sweepColour(frameIndex, framesPerSecond));
      timestampNanoseconds += frameIntervalNanoseconds;
      pushFrame(track, {
        bufferIndex: surface.index,
        timestampNs: timestampNanoseconds,
        rotation: 0,
        ...(fenceState != null
          ? { fence: { handle: fenceState.fence.export().handle, signaledValue: fenceState.signaledValue } }
          : {}),
      });
      consecutiveFailures = 0;
    } catch (cause) {
      consecutiveFailures += 1;
      console.warn(`S0-A: rendering frame ${frameIndex} failed`, cause);
      if (consecutiveFailures >= 10) {
        clearInterval(timer);
        console.error('S0-A: stopping the render loop after 10 consecutive failures');
      }
    }
    frameIndex += 1;
  }, 1000 / framesPerSecond);

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    for (const videoTrack of stream.getVideoTracks()) {
      videoTrack.stop();
    }
    await pool.dispose();
  };

  return { stream, stop };
}

/// <reference types="@webgpu/types" />
import { type PooledTrack, pushFrame } from '@fishjam-cloud/react-native-webrtc';
import { type GPUSharedTextureMemory, GPUTextureUsage } from 'react-native-webgpu';

import type { WorkletBufferDescriptor } from '../internal/useManagedPooledTrack';
import { type CameraShaderBindings, createCameraBindGroup } from './cameraShaderBindings';
import type { WebGpuFrameRenderContext, WebGpuFrameRenderFunction } from './frameRenderContext';
import { getOutputSurfaceFormat } from './requiredFeatures';
import { getWebGpuRuntime, type WebGpuRuntime } from './webGpuRuntime';

/**
 * One camera frame, reduced to what the renderer needs. A camera integration reads these from
 * whatever frame object its own library hands it.
 */
export interface WebGpuCameraFrameInput {
  /** Pointer to the native camera buffer: a `CVPixelBufferRef` on iOS, an `AHardwareBuffer*` on Android. */
  nativeBuffer: bigint;
  /** Clockwise rotation needed to bring the frame upright, applied at import. */
  rotationDegrees: 0 | 90 | 180 | 270;
  /** Whether the source mirrors the image (a front camera preview, typically). */
  isMirrored: boolean;
  /** Presentation timestamp for the published frame, in nanoseconds. Must increase per frame. */
  timestampNanoseconds: number;
}

export interface CreateWebGpuFrameRendererOptions {
  device: GPUDevice;
  track: PooledTrack;
  bufferDescriptors: WorkletBufferDescriptor[];
  cameraShaderBindings?: CameraShaderBindings;
}

export interface WebGpuFrameRenderer {
  /**
   * Worklet. Imports the camera buffer, hands `render` to `onFrame`, and publishes whatever was
   * drawn. `onFrame` may call `render` at most once; not calling it drops the frame.
   *
   * Does not release `input.nativeBuffer` — the caller owns it, because only the caller knows
   * what its camera library expects.
   */
  renderFrame: (input: WebGpuCameraFrameInput, onFrame: (render: WebGpuFrameRenderFunction) => void) => void;
}

interface ImportedSurface {
  memory: GPUSharedTextureMemory;
  texture: GPUTexture;
  view: GPUTextureView;
}

/** Per-renderer state the frame worklet mutates. Plain object so it copies into the closure. */
interface RendererState {
  poolCursor: number;
  importedByIndex: Record<number, ImportedSurface>;
}

/**
 * Builds the per-frame WebGPU render loop shared by every camera integration: camera buffer in,
 * a drawn frame pushed to a pooled Fishjam track out.
 *
 * The returned `renderFrame` runs on the frame thread. Every GPU object it touches — the shared
 * surface imports above all — is created and used on that same thread, so a renderer must not be
 * shared between two frame runtimes. Build one per (track, device) pair and rebuild it when
 * either changes.
 */
export function createWebGpuFrameRenderer(options: CreateWebGpuFrameRendererOptions): WebGpuFrameRenderer {
  const { device, track, bufferDescriptors, cameraShaderBindings } = options;

  const runtime: WebGpuRuntime = getWebGpuRuntime();
  const outputSurfaceFormat = getOutputSurfaceFormat();
  // Captured as a plain number: the worklet must not close over the GPUTextureUsage namespace.
  const renderAttachmentUsage = GPUTextureUsage.RENDER_ATTACHMENT;
  const state: RendererState = { poolCursor: 0, importedByIndex: {} };

  const renderFrame = (input: WebGpuCameraFrameInput, onFrame: (render: WebGpuFrameRenderFunction) => void): void => {
    'worklet';
    const videoFrame = runtime.createVideoFrameFromNativeBuffer(input.nativeBuffer);
    try {
      const isRotatedQuarterTurn = input.rotationDegrees === 90 || input.rotationDegrees === 270;
      const cameraWidth = isRotatedQuarterTurn ? videoFrame.height : videoFrame.width;
      const cameraHeight = isRotatedQuarterTurn ? videoFrame.width : videoFrame.height;

      const cameraTexture = device.importExternalTexture({
        // react-native-webgpu accepts its NativeVideoFrame here at runtime, but its type
        // declarations don't widen the descriptor's `source`, so cast.
        source: videoFrame as unknown as VideoFrame,
        label: 'fishjam-camera-frame',
        rotation: input.rotationDegrees,
        mirrored: input.isMirrored,
      });
      try {
        const cameraBindGroup =
          cameraShaderBindings != null ? createCameraBindGroup(device, cameraShaderBindings, cameraTexture) : undefined;

        let rendered = false;
        const render: WebGpuFrameRenderFunction = (encode) => {
          'worklet';
          if (rendered) {
            throw new Error('createWebGpuFrameRenderer: render() may only be called once per frame.');
          }
          rendered = true;

          const cursor = state.poolCursor;
          state.poolCursor = (cursor + 1) % bufferDescriptors.length;
          const descriptor = bufferDescriptors[cursor];

          let imported = state.importedByIndex[descriptor.index];
          if (imported == null) {
            const memory = device.importSharedTextureMemory({ handle: descriptor.surfaceHandle });
            const texture = memory.createTexture({
              format: outputSurfaceFormat,
              size: [descriptor.width, descriptor.height],
              usage: renderAttachmentUsage,
            });
            // Build the output view ONCE per pool slot and reuse it every frame: a GPUTextureView
            // has no release API, so a per-frame createView() leaks native wrappers on the frame
            // runtime until GC.
            imported = { memory, texture, view: texture.createView() };
            state.importedByIndex[descriptor.index] = imported;
          }

          imported.memory.beginAccess(imported.texture, false);
          let accessResult;
          try {
            const commandEncoder = device.createCommandEncoder();
            const context: WebGpuFrameRenderContext = {
              device,
              queue: device.queue,
              commandEncoder,
              cameraTexture,
              cameraBindGroup,
              outputTexture: imported.texture,
              outputView: imported.view,
              outputWidth: descriptor.width,
              outputHeight: descriptor.height,
              cameraWidth,
              cameraHeight,
              cameraIsMirrored: input.isMirrored,
            };
            encode(context);
            device.queue.submit([commandEncoder.finish()]);
          } finally {
            // Always end the access scope — leaving a slot acquired after a throw would poison it
            // for every later frame.
            accessResult = imported.memory.endAccess(imported.texture);
          }

          // endAccess returns one fence per queue that touched the memory; this access scope only
          // ever submits once on the one device queue, so [0] is the whole set.
          const fenceState = accessResult.fences[0];

          // Push directly from the worklet — native retains the fence synchronously here, so no
          // JS-side fence retention is needed. Rotation is 0: the camera was already rotated
          // upright at import time.
          pushFrame(track, {
            bufferIndex: descriptor.index,
            timestampNs: input.timestampNanoseconds,
            rotation: 0,
            ...(fenceState != null
              ? { fence: { handle: fenceState.fence.export().handle, signaledValue: fenceState.signaledValue } }
              : {}),
          });
        };

        onFrame(render);
      } finally {
        // End the camera texture's access window now — waiting for GC would starve the camera's
        // own frame buffer pool.
        cameraTexture.destroy();
      }
    } finally {
      videoFrame.release();
    }
  };

  return { renderFrame };
}

import { useEffect, useMemo, useState } from 'react';

import { toError } from '../internal/toError';
import { assertWebGpuDeviceSupportsCameraImport, getRequiredWebGpuCameraFeatures } from './requiredFeatures';
import { getWebGpuRuntime } from './webGpuRuntime';

// One app-wide device: every hook instance shares it, so per-device resources (pipelines,
// shared-texture imports) built by different callers stay valid for each other. Cleared on
// device loss or acquisition failure so a later caller retries.
let sharedDevicePromise: Promise<GPUDevice> | null = null;

async function acquireSharedCameraWebGpuDevice(): Promise<GPUDevice> {
  getWebGpuRuntime();
  const adapter = await navigator.gpu.requestAdapter();
  if (adapter == null) {
    throw new Error('WebGPU is unavailable: navigator.gpu.requestAdapter() returned no adapter.');
  }
  const device = await adapter.requestDevice({
    requiredFeatures: getRequiredWebGpuCameraFeatures(),
  });
  device.lost
    .then(() => {
      sharedDevicePromise = null;
    })
    .catch(() => {
      sharedDevicePromise = null;
    });
  return device;
}

function getSharedCameraWebGpuDevice(): Promise<GPUDevice> {
  if (sharedDevicePromise == null) {
    sharedDevicePromise = acquireSharedCameraWebGpuDevice().catch((cause: unknown) => {
      sharedDevicePromise = null;
      throw cause;
    });
  }
  return sharedDevicePromise;
}

/** Result of {@link useCameraWebGpuDevice}. */
export interface UseCameraWebGpuDeviceResult {
  /** The shared GPUDevice; `null` until acquisition resolves. */
  device: GPUDevice | null;
  /** Acquisition failure (no adapter, missing platform features), if any. */
  error: Error | null;
}

/**
 * The app-wide GPUDevice used for camera work, configured with
 * {@link getRequiredWebGpuCameraFeatures}. All callers share one device, so pipelines you build
 * against it work with the textures the source hook hands your render callback.
 *
 * Build your pipelines once the device arrives:
 * ```tsx
 * const { device } = useCameraWebGpuDevice();
 * const effect = useMemo(() => (device ? buildMyEffect(device) : null), [device]);
 * ```
 *
 * @group WebGPU
 */
export function useCameraWebGpuDevice(): UseCameraWebGpuDeviceResult {
  const [result, setResult] = useState<UseCameraWebGpuDeviceResult>({ device: null, error: null });

  useEffect(() => {
    let cancelled = false;
    getSharedCameraWebGpuDevice()
      .then((device) => {
        if (!cancelled) {
          setResult({ device, error: null });
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setResult({ device: null, error: toError(cause) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return result;
}

/**
 * Device resolution for the source hook: the user-provided override (validated) when present,
 * otherwise the shared device. Always called, so hook order stays stable either way.
 */
export function useCameraWebGpuDeviceWithOverride(override: GPUDevice | undefined): UseCameraWebGpuDeviceResult {
  const shared = useCameraWebGpuDevice();

  const overrideValidationError = useMemo(() => {
    if (override == null) {
      return null;
    }
    try {
      assertWebGpuDeviceSupportsCameraImport(override);
      return null;
    } catch (cause) {
      return toError(cause);
    }
  }, [override]);

  if (override != null) {
    return overrideValidationError != null
      ? { device: null, error: overrideValidationError }
      : { device: override, error: null };
  }
  return shared;
}

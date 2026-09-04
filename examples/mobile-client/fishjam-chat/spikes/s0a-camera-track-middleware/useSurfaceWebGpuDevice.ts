/// <reference types="@webgpu/types" />
import { useEffect, useState } from 'react';
import 'react-native-webgpu';

/**
 * A GPUDevice with only the feature S0-A actually uses: `rnwebgpu/native-texture`, which gates
 * `importSharedTextureMemory` for the output surface pool.
 *
 * Deliberately *not* `useCameraWebGpuDevice`: that also demands the platform's camera-import
 * feature (`dawn-multi-planar-formats` on iOS), which this spike never uses — asking for it would
 * fail the spike for a reason unrelated to the plumbing it is testing, and would rule out the
 * simulator. Importing camera frames is S0-C's question, not this one.
 */
export function useSurfaceWebGpuDevice(): { device: GPUDevice | null; error: Error | null } {
  const [result, setResult] = useState<{ device: GPUDevice | null; error: Error | null }>({
    device: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    const acquire = async () => {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter == null) {
        throw new Error('WebGPU is unavailable: requestAdapter() returned no adapter.');
      }
      const surfaceFeature = 'rnwebgpu/native-texture' as GPUFeatureName;
      if (!adapter.features.has(surfaceFeature)) {
        throw new Error(
          `This adapter cannot import Fishjam output surfaces: it is missing '${surfaceFeature}'. ` +
            'S0-A needs a target that supports it.',
        );
      }
      return adapter.requestDevice({ requiredFeatures: [surfaceFeature] });
    };

    acquire()
      .then((device) => {
        if (!cancelled) setResult({ device, error: null });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setResult({ device: null, error: cause instanceof Error ? cause : new Error(String(cause)) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return result;
}

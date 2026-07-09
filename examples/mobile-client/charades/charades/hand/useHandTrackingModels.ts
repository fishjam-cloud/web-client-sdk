/**
 * Loads the hand-tracking model pair once for the camera effect. Returns null
 * until both models are ready (the camera effect simply runs without hand
 * tracking until then).
 */
import { useEffect, useState } from 'react';

import {
  loadExecutorchHandTrackingModels,
  verifyExecutorchHandModelSignatures,
  type ExecutorchHandTrackingModels,
} from './executorch/loadHandTrackingModels';

export function useHandTrackingModels(): ExecutorchHandTrackingModels | null {
  const [models, setModels] = useState<ExecutorchHandTrackingModels | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const loadAndVerify = async () => {
      const loaded = await loadExecutorchHandTrackingModels();
      const mismatch = verifyExecutorchHandModelSignatures(loaded);
      if (mismatch != null) {
        throw new Error(`model signature mismatch: ${mismatch}`);
      }
      return loaded;
    };
    loadAndVerify()
      .then((loaded) => {
        if (!cancelled) {
          setModels(loaded);
        }
      })
      .catch((error: unknown) => {
        console.warn(
          'useHandTrackingModels: failed to load models: ' + String(error),
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return models;
}

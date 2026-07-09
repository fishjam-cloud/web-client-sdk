/**
 * ExecuTorch model invocation for the hand-tracking frame worklet
 * (`../handTrackingWorklet.ts`).
 *
 * Allocation discipline (zero steady-state allocation): the input/output
 * Tensors are preallocated once at load time (`loadHandTrackingModels.ts`),
 * the destination Float32Arrays are preallocated once in the worklet state,
 * and every inference is setData -> execute -> getData into those same
 * buffers. The Model and Tensor JSI host objects arrive in the worklet
 * closure via react-native-worklets host-object serialization (the same
 * mechanism the rewrite's own `*Worklet` task variants rely on).
 *
 * Everything here is workletized and fully self-contained (module scope does
 * not exist inside worklets); models and tensors come in as parameters.
 */
import type { Model } from 'react-native-executorch';

import type { ExecutorchHandModelTensors } from './loadHandTrackingModels';

/**
 * Runs the palm detector on a 192x192x3 RGB [0,1] tensor and copies the raw
 * outputs into the caller's preallocated arrays (boxes 2016*18, logits 2016).
 */
export function runExecutorchDetectorInference(
  detectorModel: Model,
  tensors: ExecutorchHandModelTensors,
  inputPixels: Float32Array,
  rawBoxesOut: Float32Array,
  rawLogitsOut: Float32Array,
): void {
  'worklet';
  tensors.detectorInput.setData(inputPixels);
  detectorModel.execute(
    'forward',
    [tensors.detectorInput],
    [tensors.detectorBoxes, tensors.detectorScores],
  );
  tensors.detectorBoxes.getData(rawBoxesOut);
  tensors.detectorScores.getData(rawLogitsOut);
}

/**
 * Runs the landmark model on a 224x224x3 RGB [0,1] crop tensor and copies the
 * raw landmarks (63) + presence (1) into the caller's preallocated arrays.
 * Handedness and world landmarks are computed by the model (execute() fills
 * every output tensor) but not copied — the live worklet never reads them.
 */
export function runExecutorchLandmarksInference(
  landmarksModel: Model,
  tensors: ExecutorchHandModelTensors,
  inputPixels: Float32Array,
  rawLandmarksOut: Float32Array,
  presenceOut: Float32Array,
): void {
  'worklet';
  tensors.landmarksInput.setData(inputPixels);
  landmarksModel.execute(
    'forward',
    [tensors.landmarksInput],
    [
      tensors.landmarksOutput,
      tensors.landmarksPresence,
      tensors.landmarksHandedness,
      tensors.landmarksWorld,
    ],
  );
  tensors.landmarksOutput.getData(rawLandmarksOut);
  tensors.landmarksPresence.getData(presenceOut);
}

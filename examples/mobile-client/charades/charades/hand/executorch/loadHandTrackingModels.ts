/**
 * Loads the two MediaPipe hand-tracking models via the react-native-executorch
 * REWRITE (`loadModel` / `tensor` core primitives).
 *
 * The `.pte` files are the exact MediaPipe `.tflite` models re-exported
 * through ExecuTorch 1.3.1 (XNNPACK-delegated, fp32, inputs preserved as
 * NHWC), verified bit-exact against the originals on the lab fixtures — same
 * shapes, same output order, presence stays post-sigmoid, detector scores
 * stay logits. The chaining glue in `charades/hand/tracking/` consumes the
 * raw outputs unchanged.
 *
 * Model loading runs on the library's background worklet runtime (wrapAsync)
 * so ExecuTorch compilation never blocks the JS thread. The input/output
 * tensors are allocated ONCE here and reused for every inference — they cross
 * into the camera frame-processor worklet as JSI host objects, exactly like
 * the Model objects (see `handInferenceWorklet.ts`).
 */
import { Asset } from 'expo-asset';
import {
  loadModel,
  tensor,
  wrapAsync,
  type Model,
  type Tensor,
} from 'react-native-executorch';

import handDetectorModelAsset from '../../../assets/models/hand_detector.pte';
import handLandmarksDetectorModelAsset from '../../../assets/models/hand_landmarks_detector.pte';

/** Preallocated inference tensors, one set per app session. */
export interface ExecutorchHandModelTensors {
  /** [1, 192, 192, 3] f32 RGB [0,1] letterboxed frame. */
  detectorInput: Tensor;
  /** [1, 2016, 18] boxes + 7 palm keypoints per anchor. */
  detectorBoxes: Tensor;
  /** [1, 2016, 1] score logits. */
  detectorScores: Tensor;
  /** [1, 224, 224, 3] f32 RGB [0,1] rotated hand crop. */
  landmarksInput: Tensor;
  /** [1, 63] — 21 x (x, y, z) in crop pixels. */
  landmarksOutput: Tensor;
  /** [1, 1] presence (post-sigmoid). */
  landmarksPresence: Tensor;
  /** [1, 1] handedness. */
  landmarksHandedness: Tensor;
  /** [1, 63] world landmarks (unused, but execute() fills every output). */
  landmarksWorld: Tensor;
}

export interface ExecutorchHandTrackingModels {
  detector: Model;
  landmarks: Model;
  tensors: ExecutorchHandModelTensors;
}

/**
 * Resolves a Metro-bundled model asset to a local filesystem path `loadModel`
 * can open: `downloadAsync` fetches from the Metro dev server in development
 * and is a no-op pointing at the bundled file in release builds.
 */
async function resolveModelAssetPath(assetModuleId: number): Promise<string> {
  const asset = Asset.fromModule(assetModuleId);
  await asset.downloadAsync();
  if (!asset.localUri) {
    throw new Error(
      `hand model asset ${asset.name ?? assetModuleId} has no localUri after downloadAsync`,
    );
  }
  return asset.localUri.replace(/^file:\/\//, '');
}

export async function loadExecutorchHandTrackingModels(): Promise<ExecutorchHandTrackingModels> {
  const [detectorPath, landmarksPath] = await Promise.all([
    resolveModelAssetPath(handDetectorModelAsset),
    resolveModelAssetPath(handLandmarksDetectorModelAsset),
  ]);

  const loadModelOffThread = wrapAsync(loadModel);
  const detector = await loadModelOffThread(detectorPath);
  const landmarks = await loadModelOffThread(landmarksPath);

  const tensors: ExecutorchHandModelTensors = {
    detectorInput: tensor('float32', [1, 192, 192, 3]),
    detectorBoxes: tensor('float32', [1, 2016, 18]),
    detectorScores: tensor('float32', [1, 2016, 1]),
    landmarksInput: tensor('float32', [1, 224, 224, 3]),
    landmarksOutput: tensor('float32', [1, 63]),
    landmarksPresence: tensor('float32', [1, 1]),
    landmarksHandedness: tensor('float32', [1, 1]),
    landmarksWorld: tensor('float32', [1, 63]),
  };

  return { detector, landmarks, tensors };
}

// --- Expected I/O signatures (verified at export time). ---------------------

const EXPECTED_DETECTOR_INPUT = [1, 192, 192, 3];
const EXPECTED_DETECTOR_OUTPUTS = [
  [1, 2016, 18], // boxes + 7 palm keypoints per anchor
  [1, 2016, 1], // score logits
];
const EXPECTED_LANDMARKS_INPUT = [1, 224, 224, 3];
const EXPECTED_LANDMARKS_OUTPUTS = [
  [1, 63], // 21 x (x, y, z) in crop pixels
  [1, 1], // presence
  [1, 1], // handedness
  [1, 63], // world landmarks (unused)
];

function shapesEqual(actual: readonly number[], expected: number[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((dimension, index) => dimension === expected[index])
  );
}

function checkModel(
  model: Model,
  label: string,
  expectedInput: number[],
  expectedOutputs: number[][],
): string | null {
  if (!model.getMethodNames().includes('forward')) {
    return `${label}: no 'forward' method (has ${JSON.stringify(model.getMethodNames())})`;
  }
  const meta = model.getMethodMeta('forward');
  const input = meta.inputTensorMeta[0];
  if (!input || !shapesEqual(input.shape, expectedInput)) {
    return `${label}: input shape ${JSON.stringify(input?.shape)} != ${JSON.stringify(expectedInput)}`;
  }
  if (input.dtype !== 'float32') {
    return `${label}: input dtype ${input.dtype} != float32`;
  }
  if (meta.outputTensorMeta.length !== expectedOutputs.length) {
    return `${label}: ${meta.outputTensorMeta.length} outputs, expected ${expectedOutputs.length}`;
  }
  for (let index = 0; index < expectedOutputs.length; index += 1) {
    if (!shapesEqual(meta.outputTensorMeta[index].shape, expectedOutputs[index])) {
      return `${label}: output[${index}] shape ${JSON.stringify(meta.outputTensorMeta[index].shape)} != ${JSON.stringify(expectedOutputs[index])}`;
    }
  }
  return null;
}

/**
 * Verifies both models expose the exact I/O signatures the tracking glue is
 * written against. Returns null when everything matches, otherwise a
 * human-readable description of the first mismatch.
 */
export function verifyExecutorchHandModelSignatures(
  models: ExecutorchHandTrackingModels,
): string | null {
  return (
    checkModel(
      models.detector,
      'detector',
      EXPECTED_DETECTOR_INPUT,
      EXPECTED_DETECTOR_OUTPUTS,
    ) ??
    checkModel(
      models.landmarks,
      'landmarks',
      EXPECTED_LANDMARKS_INPUT,
      EXPECTED_LANDMARKS_OUTPUTS,
    )
  );
}

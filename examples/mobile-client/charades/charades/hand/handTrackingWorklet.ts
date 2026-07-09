/**
 * PER-FRAME PIXEL EXTRACTION (runs in the VisionCamera frame worklet)
 * ============================================================================
 *
 * This is the ONLY hand-tracking work that must touch the camera `Frame`, so it
 * is the only part that runs on the VisionCamera frame thread
 * (`lo.camera.frame`). It converts the frame to a display-oriented image, does
 * ONE small downscale, and copies the pixels into a JS `ArrayBuffer`:
 *
 *   Frame -> FrameConverter Image (already display-oriented on iOS)
 *         -> ONE small resize (÷3) -> ONE toRawPixelData
 *
 * The heavy work — ExecuTorch detector/landmark inference and the tracking
 * maths — is deliberately NOT done here. It runs on a separate runtime
 * (`handInferenceRuntime.ts`) fed the extracted buffer, so this thread stays
 * light and ART's GC can suspend it (see `handInferenceRuntime.ts` for the
 * SuspendAll-deadlock this split avoids).
 *
 * Workletized; the frame converter is a Nitro HybridObject that arrives boxed
 * and is unboxed lazily on this runtime.
 */
import type { BoxedHybridObject } from 'react-native-nitro-modules';
import type { Frame, FrameConverter } from 'react-native-vision-camera';
import type { Image as NitroImage } from 'react-native-nitro-image';

import type { RawPixels } from './handCpuFrameWorklet';

/** Inputs the frame worklet needs to extract pixels; prepared once at setup. */
export interface HandFrameExtractInputs {
  boxedFrameConverter: BoxedHybridObject<FrameConverter>;
}

/**
 * Frame-thread mutable state: the unboxed converter (lazily on this runtime)
 * plus a frame counter for throttling.
 */
export function createHandFrameExtractState() {
  return {
    frameTick: 0,
    frameConverter: null as FrameConverter | null,
  };
}

export type HandFrameExtractState = ReturnType<
  typeof createHandFrameExtractState
>;

/**
 * Extracts the downscaled camera pixels for one frame, or `null` if extraction
 * failed. The returned `RawPixels`' `buffer` is a JS `ArrayBuffer` (a copy), so
 * the caller may schedule it onto another runtime and let the source images die.
 *
 * Both intermediate nitro `Image`s wrap a native Bitmap (native-heap memory);
 * `toRawPixelData` copies the pixels into a JS `ArrayBuffer`, so both are
 * disposed immediately in `try/finally` — without it the native heap grows
 * unbounded on this per-frame path (GC rarely runs on a frame worklet runtime).
 */
export function extractHandFramePixels(
  state: HandFrameExtractState,
  inputs: HandFrameExtractInputs,
  frame: Frame,
): RawPixels | null {
  'worklet';
  if (state.frameConverter == null) {
    state.frameConverter = inputs.boxedFrameConverter.unbox();
  }
  // The converter's image is ALREADY display-oriented (orientation flag); do
  // NOT rotate it again. nitro-image logical sizes lie (screen-scale redraws),
  // so downstream only the raw buffer's measured dimensions are used.
  const orientedImage: NitroImage =
    state.frameConverter.convertFrameToImage(frame);
  try {
    const smallImage = orientedImage.resize(
      Math.round(orientedImage.width / 3),
      Math.round(orientedImage.height / 3),
    );
    try {
      return smallImage.toRawPixelData(false);
    } finally {
      smallImage.dispose();
    }
  } finally {
    orientedImage.dispose();
  }
}

/**
 * Swappable input abstraction for the charades brush cursor.
 *
 * A `HandSource` owns a single cross-runtime cursor value — a
 * react-native-worklets {@link Synchronizable}. The producer (a touch drag in
 * P4's mock, an ExecuTorch hand-tracking source in P6) writes the cursor on the
 * JS runtime; the VisionCamera `onFrame` worklet reads it every frame via
 * `cursor.getDirty()` (a cheap, lock-free read of the last committed value) and
 * turns it into a `BrushInput`.
 *
 * The Synchronizable is the ONLY thing the worklet captures from the source: it
 * is a serializable NativeState ref that the Worklets custom serializer ships
 * across the runtime boundary and re-decorates on the worklet runtime, so
 * `getDirty()` is callable there. The source's methods (`start`/`stop`/`moveTo`)
 * are NOT serializable and must never be captured into the worklet.
 *
 * This is the seam that lets P6 drop in an ExecuTorch source with zero changes
 * to the pipeline or the hook — same `cursor` contract, different producer.
 */
import {
  createSynchronizable,
  type Synchronizable,
} from 'react-native-worklets';

/** The cursor state shared JS-runtime -> onFrame worklet each frame. */
export interface CursorState {
  /** OUTPUT display uv in [0,1]. */
  x: number;
  /** OUTPUT display uv in [0,1]. */
  y: number;
  /** Drawing while true (pinch / pen-down). */
  pinch: boolean;
  /** A hand/cursor is currently active. */
  present: boolean;
  /** Bumped on every cursor write (lets the worklet detect fresh input). */
  epoch: number;
  /** Bumped to request a one-shot strokes clear. */
  clearEpoch: number;
}

/** The worklets-backed shared cursor cell. */
export type CursorSync = Synchronizable<CursorState>;

/** Creates the shared cursor cell with a neutral, centered, not-present state. */
export function createCursorSync(): CursorSync {
  return createSynchronizable<CursorState>({
    x: 0.5,
    y: 0.5,
    pinch: false,
    present: false,
    epoch: 0,
    clearEpoch: 0,
  });
}

/** A swappable producer of the shared brush cursor. */
export interface HandSource {
  /** The cross-runtime cursor cell the onFrame worklet reads each frame. */
  readonly cursor: CursorSync;
  /** Begin producing cursor updates (no-op for the mock; real work in P6). */
  start(): void | Promise<void>;
  /** Stop producing cursor updates. */
  stop(): void;
  /**
   * Optional per-camera-frame hook (a 'worklet' in P6, unused by the mock),
   * used by a frame-driven source to derive the cursor from the camera image.
   */
  onCameraFrame?(frame: unknown): void;
}

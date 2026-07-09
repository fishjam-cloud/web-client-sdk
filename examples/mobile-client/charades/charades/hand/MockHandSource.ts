/**
 * A `HandSource` driven by on-screen touch (via `CharadesTouchOverlay`).
 *
 * `moveTo`/`clear` run on the JS runtime and commit to the shared cursor cell
 * with `setBlocking(updater)`, which the Worklets runtime applies atomically
 * (lock -> read -> mutate -> write -> unlock) so a concurrent worklet-side
 * `getDirty()` never observes a torn value. `start`/`stop` are no-ops here, but
 * exist so the screen can drive the same lifecycle P6's real source needs.
 */
import { createCursorSync, type HandSource } from './HandSource';

/** A HandSource plus the imperative touch controls the overlay/screen call. */
export type MockHandSource = HandSource & {
  /** Write the cursor: new uv position + draw flag; marks it present. */
  moveTo(x: number, y: number, pinch: boolean): void;
  /** Request a one-shot strokes clear (position/draw left untouched). */
  clear(): void;
};

/** Creates a touch-driven mock hand source. Keep it stable via `useMemo`. */
export function createMockHandSource(): MockHandSource {
  const cursor = createCursorSync();

  const moveTo = (x: number, y: number, pinch: boolean): void => {
    cursor.setBlocking((prev) => ({
      ...prev,
      x,
      y,
      pinch,
      present: true,
      epoch: prev.epoch + 1,
      // clearEpoch intentionally left unchanged.
    }));
  };

  const clear = (): void => {
    cursor.setBlocking((prev) => ({
      ...prev,
      clearEpoch: prev.clearEpoch + 1,
      // x / y / pinch intentionally left unchanged.
    }));
  };

  return {
    cursor,
    start() {},
    stop() {},
    moveTo,
    clear,
  };
}

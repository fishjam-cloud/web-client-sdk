import { createSynchronizable, type Synchronizable } from 'react-native-worklets';

// VisionCamera 5.x reports Frame.timestamp in platform-inconsistent units: seconds on iOS
// (CMTime.seconds) and nanoseconds on Android (the raw CameraX sensor timestamp). Rather than
// branching on the platform — which would silently break if VisionCamera ever aligns the units —
// we discriminate by magnitude: seconds-since-boot values sit around 1e5–1e6 while
// nanoseconds-since-boot values sit around 1e14, so any value at or above this threshold is
// already in nanoseconds.
const NANOSECONDS_MAGNITUDE_THRESHOLD = 1e12;

const NANOSECONDS_PER_SECOND = 1e9;

interface FrameTimestampTimeline {
  /** Absolute timestamp of the first frame, in nanoseconds; the timeline's zero point. */
  firstNanoseconds: number | null;
  /** Last emitted timeline value, in nanoseconds; used to reject non-monotonic timestamps. */
  lastNanoseconds: number;
}

/**
 * Per-track timestamp timeline. A `Synchronizable` box (not a plain object) so the state survives
 * frame-callback re-registration: a plain captured object is copied into each new worklet closure,
 * which would restart the timeline mid-stream and emit timestamps that jump backwards.
 */
export type FrameTimestampState = Synchronizable<FrameTimestampTimeline>;

export function createFrameTimestampState(): FrameTimestampState {
  // lastNanoseconds starts below zero so the first frame (offset 0) passes the monotonicity check.
  return createSynchronizable<FrameTimestampTimeline>({ firstNanoseconds: null, lastNanoseconds: -1 });
}

/**
 * Converts a raw VisionCamera `Frame.timestamp` into a monotonic nanosecond timeline that starts
 * at zero on the first frame, preserving the real gaps between frames for encoder pacing.
 *
 * Returns `null` when the frame carries no usable timestamp (invalid frames report `0`) or when
 * the value does not advance the timeline — callers should then fall back to their tier's default
 * (omit the timestamp so the native layer stamps a monotonic clock, or synthesize from the frame
 * interval).
 */
export function normalizeFrameTimestampNanoseconds(state: FrameTimestampState, rawTimestamp: number): number | null {
  'worklet';
  if (!(rawTimestamp > 0)) {
    return null;
  }
  const absoluteNanoseconds =
    rawTimestamp >= NANOSECONDS_MAGNITUDE_THRESHOLD ? rawTimestamp : rawTimestamp * NANOSECONDS_PER_SECOND;
  const timeline = state.getBlocking();
  const firstNanoseconds = timeline.firstNanoseconds ?? absoluteNanoseconds;
  const timelineNanoseconds = absoluteNanoseconds - firstNanoseconds;
  if (timelineNanoseconds <= timeline.lastNanoseconds) {
    return null;
  }
  state.setBlocking({ firstNanoseconds, lastNanoseconds: timelineNanoseconds });
  return timelineNanoseconds;
}

/**
 * Like {@link normalizeFrameTimestampNanoseconds}, but never fails: when the frame carries no
 * usable timestamp, it advances the timeline by `frameIntervalNanoseconds` instead. For sinks
 * that require a timestamp on every frame (`pushFrame`).
 */
export function nextFrameTimestampNanoseconds(
  state: FrameTimestampState,
  rawTimestamp: number,
  frameIntervalNanoseconds: number,
): number {
  'worklet';
  const normalized = normalizeFrameTimestampNanoseconds(state, rawTimestamp);
  if (normalized != null) {
    return normalized;
  }
  const timeline = state.getBlocking();
  const fallbackNanoseconds = timeline.lastNanoseconds < 0 ? 0 : timeline.lastNanoseconds + frameIntervalNanoseconds;
  state.setBlocking({ firstNanoseconds: timeline.firstNanoseconds, lastNanoseconds: fallbackNanoseconds });
  return fallbackNanoseconds;
}

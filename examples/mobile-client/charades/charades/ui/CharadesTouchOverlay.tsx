/**
 * Absolute-fill touch surface layered over the charades self-view.
 *
 * A RNGH `Pan` gesture maps the finger position to OUTPUT display uv and feeds
 * the mock hand source: the overlay is sized 1:1 with the square composite, so
 * overlay-normalized coordinates ARE the output uv directly — no mirror, no
 * calibration (P7 handles that for the real hand). Dragging paints (draw = true
 * unless Hover is on); lifting the finger lifts the pen.
 *
 * The gesture runs its callbacks on the JS runtime (`.runOnJS(true)`), so it
 * calls the mock's `moveTo` — which writes the shared cursor cell on the JS
 * runtime — directly, with no worklet capture or cross-runtime marshaling.
 * The app root does not mount `GestureHandlerRootView`, so we wrap locally.
 */
import { useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';

import type { MockHandSource } from '../hand/MockHandSource';

interface CharadesTouchOverlayProps {
  handSource: MockHandSource;
  /** When true, move the cursor without drawing (pen stays up). */
  hover: boolean;
}

const clamp01 = (value: number): number =>
  value < 0 ? 0 : value > 1 ? 1 : value;

export function CharadesTouchOverlay({
  handSource,
  hover,
}: CharadesTouchOverlayProps) {
  // Overlay pixel size (from onLayout) and the last uv, kept in refs so the
  // gesture object stays stable while callbacks always read fresh values.
  const sizeRef = useRef({ width: 0, height: 0 });
  const lastRef = useRef({ x: 0.5, y: 0.5 });
  const hoverRef = useRef(hover);
  hoverRef.current = hover;

  const handleLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    sizeRef.current = { width, height };
  };

  const pan = useMemo(() => {
    const toUv = (localX: number, localY: number) => {
      const { width, height } = sizeRef.current;
      if (width <= 0 || height <= 0) {
        return null;
      }
      const x = clamp01(localX / width);
      const y = clamp01(localY / height);
      lastRef.current = { x, y };
      return { x, y };
    };

    return (
      Gesture.Pan()
        // Force JS-runtime callbacks so we can call the mock's moveTo directly.
        .runOnJS(true)
        .onBegin((event) => {
          const uv = toUv(event.x, event.y);
          if (uv) {
            handSource.moveTo(uv.x, uv.y, !hoverRef.current);
          }
        })
        .onUpdate((event) => {
          const uv = toUv(event.x, event.y);
          if (uv) {
            handSource.moveTo(uv.x, uv.y, !hoverRef.current);
          }
        })
        // Lift the pen when the drag ends, is cancelled, or fails.
        .onFinalize(() => {
          const { x, y } = lastRef.current;
          handSource.moveTo(x, y, false);
        })
    );
  }, [handSource]);

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={pan}>
        <View style={StyleSheet.absoluteFill} onLayout={handleLayout} />
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

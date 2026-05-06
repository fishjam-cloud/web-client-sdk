import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Returns a stable function reference whose body always reads the latest
 * closure values. Use when a method needs to be called from effects or
 * captured by consumers without being memoized against changing state
 * (peerStatus, deviceTrack, etc.) in its dep array.
 */
export const useCurrentCallback = <Args extends unknown[], R>(handler: (...args: Args) => R) => {
  const ref = useRef(handler);
  useLayoutEffect(() => {
    ref.current = handler;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
};

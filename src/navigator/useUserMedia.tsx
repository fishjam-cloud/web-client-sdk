import { useMemo } from "react";
import { useMedia } from "./useMedia";

/**
 * Hook that returns the media stream and methods to control it, depending on the passed constraints.
 *
 * @param constraints - MediaStreamConstraints with configuration for media stream
 * @returns object containing information about the media stream and methods to control it
 *
 * @example
 * const constraints = {
 *  video: true,
 *  audio: true,
 * };
 *
 * const { stream, isLoading, start, stop, isEnabled, disable, enable } = useUserMedia(constraints);
 *
 */
export const useUserMedia = (constraints: MediaStreamConstraints | null) =>
  useMedia(useMemo(() => (constraints ? () => navigator.mediaDevices.getUserMedia(constraints) : null), [constraints]));

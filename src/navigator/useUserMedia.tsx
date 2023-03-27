import { useMemo } from "react";
import { useMedia } from "./useMedia";

export const useUserMedia = (constraints: MediaStreamConstraints | null) =>
  useMedia(useMemo(() => (constraints ? () => navigator.mediaDevices.getUserMedia(constraints) : null), [constraints]));

import type { Track, TracksMiddleware } from "../types/public";
import { useFishjamContext } from "./internal/useFishjamContext";

/**
 *
 * @category Devices
 * @group Types
 */
export type UseScreenshareResult = {
  startStreaming: (props?: {
    audioConstraints?: boolean | MediaTrackConstraints;
    videoConstraints?: boolean | MediaTrackConstraints;
  }) => Promise<void>;
  stopStreaming: () => Promise<void>;
  stream: MediaStream | null;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  videoBroadcast: Track | null;
  audioBroadcast: Track | null;
  setTracksMiddleware: (middleware: TracksMiddleware | null) => Promise<void>;
  currentTracksMiddleware: TracksMiddleware | null;
};

/**
 *
 * @category Devices
 * @group Hooks
 */
export const useScreenShare = () => {
  const { screenShareManager } = useFishjamContext();

  return screenShareManager;
};

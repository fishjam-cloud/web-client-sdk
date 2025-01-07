import type { TracksMiddleware } from "../types/public";
import { useFishjamContext } from "./internal/useFishjamContext";

/**
 *
 * @category Devices
 * @group Types
 */
export type UseScreenshareResult = {
  /**
   * Invokes the screen sharing prompt in the user's browser and starts streaming upon approval.
   */
  startStreaming: (props?: {
    audioConstraints?: boolean | MediaTrackConstraints;
    videoConstraints?: boolean | MediaTrackConstraints;
  }) => Promise<void>;
  /**
   * Stops the stream and cancels browser screen sharing.
   */
  stopStreaming: () => Promise<void>;
  /**
   * The MediaStream object containing both tracks.
   */
  stream: MediaStream | null;
  /**
   * The separate video MediaStreamTrack.
   */
  videoTrack: MediaStreamTrack | null;
  /**
   * The separate audio MediaStreamTrack.
   */
  audioTrack: MediaStreamTrack | null;
  /**
   * The middleware currently assigned to process the tracks.
   * A screenshare may include both audio and video tracks, and this middleware is capable of processing
   * each track type.
   */
  currentTracksMiddleware: TracksMiddleware | null;
  /**
   * Sets the middleware responsible for processing the tracks.
   * @param middleware The middleware to set, which can be a TracksMiddleware instance or null to remove the middleware.
   * @returns A Promise that resolves once the middleware is successfully set.
   */
  setTracksMiddleware: (middleware: TracksMiddleware | null) => Promise<void>;
};

/**
 * Hook to enable screen sharing within a room and manage the existing stream.
 * @category Devices
 * @group Hooks
 */
export const useScreenShare = () => {
  const { screenShareManager } = useFishjamContext();

  return screenShareManager;
};

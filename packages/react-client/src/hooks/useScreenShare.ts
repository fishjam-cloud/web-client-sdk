import { useFishjamContext } from "./internal/useFishjamContext";

/**
 * Hook to enable screen sharing within a room and manage the existing stream.
 * @category Devices
 * @group Hooks
 */
export const useScreenShare = () => {
  const { screenShareManager } = useFishjamContext();

  return {
    /**
     * Invokes the screen sharing prompt in the user's browser and starts streaming upon approval.
     */
    startStreaming: screenShareManager.startStreaming,
    /**
     * Stops the stream and cancels browser screen sharing.
     */
    stopStreaming: screenShareManager.stopStreaming,
    /**
     * The MediaStream object containing both tracks.
     */
    stream: screenShareManager.stream,
    /**
     * The separate video MediaStreamTrack.
     */
    videoTrack: screenShareManager.videoTrack,
    /**
     * The separate audio MediaStreamTrack.
     */
    audioTrack: screenShareManager.audioTrack,
    /**
     * The middleware currently assigned to process the tracks.
     * A screenshare may include both audio and video tracks, and this middleware is capable of processing
     * each track type.
     */
    currentTracksMiddleware: screenShareManager.currentTracksMiddleware,
    /**
     * Sets the middleware responsible for processing the tracks.
     * @param middleware The middleware to set, which can be a TracksMiddleware instance or null to remove the middleware.
     * @returns A Promise that resolves once the middleware is successfully set.
     */
    setTracksMiddleware: screenShareManager.setTracksMiddleware,
  };
};

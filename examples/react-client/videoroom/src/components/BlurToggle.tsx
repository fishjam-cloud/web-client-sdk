import { TrackMiddleware, useCamera } from "@fishjam-cloud/react-client";
import { useRef, useCallback } from "react";
import { BlurProcessor } from "../utils/blur/BlurProcessor";
import { Button } from "./Button";

export function BlurToggle() {
  const camera = useCamera();

  const blurProcessorRef = useRef<BlurProcessor | null>(null);

  const blurMiddleware: TrackMiddleware = useCallback(
    (videoTrack: MediaStreamTrack | null) => {
      if (!videoTrack) return videoTrack;

      const stream = new MediaStream([videoTrack]);
      const blurProcessor = new BlurProcessor(stream);
      blurProcessorRef.current = blurProcessor;

      return blurProcessor.stream.getVideoTracks()[0];
    },
    [],
  );

  const clearBlurMiddleware = async () => {
    await camera.setTrackMiddleware(null);
    blurProcessorRef.current?.destroy();
    blurProcessorRef.current = null;
  };

  const isMiddlewareSet = camera.currentTrackMiddleware === blurMiddleware;

  const onClick = isMiddlewareSet
    ? clearBlurMiddleware
    : () => camera.setTrackMiddleware(blurMiddleware);

  const title = isMiddlewareSet ? "Clear blur" : "Blur camera";

  return (
    <Button
      className="w-full"
      disabled={!camera.getCurrentTrack()?.trackId}
      onClick={onClick}
    >
      {title}
    </Button>
  );
}

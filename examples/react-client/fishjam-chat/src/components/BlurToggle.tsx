import { TrackMiddleware, useCamera } from "@fishjam-cloud/react-client";
import { useCallback } from "react";
import { BlurProcessor } from "../utils/blur/BlurProcessor";
import { Button } from "./Button";

export function BlurToggle() {
  const camera = useCamera();

  const blurMiddleware: TrackMiddleware = useCallback(
    (videoTrack: MediaStreamTrack | null) => {
      if (!videoTrack) return { track: null };

      const stream = new MediaStream([videoTrack]);
      const blurProcessor = new BlurProcessor(stream);

      return {
        track: blurProcessor.track,
        onClear: () => blurProcessor.destroy(),
      };
    },
    [],
  );

  const isMiddlewareSet = camera.currentTrackMiddleware === blurMiddleware;

  const toggleBlurMiddleware = () =>
    camera.setTrackMiddleware(isMiddlewareSet ? null : blurMiddleware);

  const title = isMiddlewareSet ? "Clear blur" : "Blur camera";

  return (
    <Button className="w-full" onClick={toggleBlurMiddleware}>
      {title}
    </Button>
  );
}

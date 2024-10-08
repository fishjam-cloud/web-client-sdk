import { TrackMiddleware, useCamera } from "@fishjam-cloud/react-client";
import { useCallback } from "react";
import { BlurProcessor } from "../utils/blur/BlurProcessor";
import { Button } from "./Button";

export function BlurToggle() {
  const camera = useCamera();

  const blurMiddleware: TrackMiddleware = useCallback(
    (track: MediaStreamTrack) => {
      const stream = new MediaStream([track]);
      const blurProcessor = new BlurProcessor(stream);

      return {
        track: blurProcessor.track,
        onClear: () => blurProcessor.destroy(),
      };
    },
    [],
  );

  const isMiddlewareSet = camera.currentMiddleware === blurMiddleware;

  const toggleBlurMiddleware = () =>
    camera.setTrackMiddleware(isMiddlewareSet ? null : blurMiddleware);

  const title = isMiddlewareSet ? "Clear blur" : "Blur camera";

  return (
    <Button className="w-full" onClick={toggleBlurMiddleware}>
      {title}
    </Button>
  );
}

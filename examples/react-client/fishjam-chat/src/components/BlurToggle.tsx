import type { TrackMiddleware } from "@fishjam-cloud/react-client";
import { useCamera } from "@fishjam-cloud/react-client";
import type { FC, PropsWithChildren } from "react";
import { createContext, useCallback, useContext } from "react";
import { BlurProcessor } from "../utils/blur/BlurProcessor";
import { Button, type ButtonProps } from "./ui/button";
import { Stars } from "lucide-react";
import { cn } from "@/lib/utils";

const BlurContext = createContext<{
  toggleBlur: () => Promise<void>;
  isBlurEnabled: boolean;
} | null>(null);

export const BlurProvider: FC<PropsWithChildren> = ({ children }) => {
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

  const isBlurEnabled = camera.currentMiddleware === blurMiddleware;

  const toggleBlur = () =>
    camera.setTrackMiddleware(isBlurEnabled ? null : blurMiddleware);

  return (
    <BlurContext.Provider value={{ toggleBlur, isBlurEnabled }}>
      {children}
    </BlurContext.Provider>
  );
};

export const BlurToggleButton: FC<
  ButtonProps & React.RefAttributes<HTMLButtonElement>
> = (props) => {
  const blurCtx = useContext(BlurContext);

  if (!blurCtx) throw Error("BlurToggle must be used within BlurProvider");

  return (
    <Button
      {...props}
      variant={blurCtx.isBlurEnabled ? "default" : "outline"}
      onClick={blurCtx.toggleBlur}
      className={cn("space-x-2", props.className)}
    >
      <Stars size={20} strokeWidth={"1.5px"} />
      <span>{blurCtx.isBlurEnabled ? "Disable" : "Enable"} Blur</span>
    </Button>
  );
};

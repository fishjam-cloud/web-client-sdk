import { useCamera, useMicrophone } from "@fishjam-cloud/react-client";
import { DeviceSelect } from "./DeviceSelect";
import VideoPlayer from "./VideoPlayer";
import AudioVisualizer from "./AudioVisualizer";
import { BlurToggleButton } from "./BlurToggle";

export const CameraSettings = () => {
  const { stream, devices, initialize, activeDevice } = useCamera();

  return (
    <div className="space-y-4">
      <DeviceSelect
        devices={devices}
        onSelectDevice={initialize}
        defaultDevice={activeDevice ?? devices[0]}
      />

      <BlurToggleButton type="button" />

      {stream && <VideoPlayer className="rounded-md" stream={stream} />}
    </div>
  );
};

export const MicrophoneSettings = () => {
  const { stream, devices, initialize, activeDevice } = useMicrophone();

  return (
    <div className="flex justify-center flex-col items-center gap-4">
      <DeviceSelect
        devices={devices}
        onSelectDevice={initialize}
        defaultDevice={activeDevice ?? devices[0]}
      />

      {stream && <AudioVisualizer stream={stream} />}
    </div>
  );
};

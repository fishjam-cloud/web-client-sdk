import { useCamera, useMicrophone } from "@fishjam-cloud/react-client";
import { DeviceSelect } from "./DeviceSelect";
import VideoPlayer from "./VideoPlayer";
import AudioVisualizer from "./AudioVisualizer";
import { BlurToggleButton } from "./BlurToggle";

export const CameraSettings = () => {
  const { stream, devices, initialize, activeDevice } = useCamera();

  const hasValidDevices = devices.some((device) => device.deviceId);

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <DeviceSelect
        devices={devices}
        onSelectDevice={initialize}
        defaultDevice={activeDevice ?? devices[0]}
      />

      {hasValidDevices && <BlurToggleButton type="button" />}

      {stream && <VideoPlayer className="rounded-md" stream={stream} />}
    </div>
  );
};

export const MicrophoneSettings = () => {
  const { stream, devices, initialize, activeDevice } = useMicrophone();

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <DeviceSelect
        devices={devices}
        onSelectDevice={initialize}
        defaultDevice={activeDevice ?? devices[0]}
      />

      {stream && <AudioVisualizer stream={stream} />}
    </div>
  );
};

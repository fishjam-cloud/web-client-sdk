import { useCamera, useMicrophone } from "@fishjam-cloud/react-client";

import AudioVisualizer from "./AudioVisualizer";
import { BlurToggleButton } from "./BlurToggle";
import { DeviceSelect } from "./DeviceSelect";
import VideoPlayer from "./VideoPlayer";

export const CameraSettings = () => {
  const { cameraStream, cameraDevices, selectCamera, activeCamera } =
    useCamera();

  const hasValidDevices = cameraDevices.some((device) => device.deviceId);

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <DeviceSelect
        devices={cameraDevices}
        onSelectDevice={selectCamera}
        defaultDevice={activeCamera ?? cameraDevices[0]}
      />

      {hasValidDevices && <BlurToggleButton type="button" />}

      {cameraStream && (
        <VideoPlayer className="rounded-md" stream={cameraStream} />
      )}
    </div>
  );
};

export const MicrophoneSettings = () => {
  const {
    microphoneStream,
    microphoneDevices,
    selectMicrophone,
    activeMicrophone,
  } = useMicrophone();

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <DeviceSelect
        devices={microphoneDevices}
        defaultDevice={activeMicrophone ?? microphoneDevices[0]}
        onSelectDevice={selectMicrophone}
      />

      {microphoneStream && <AudioVisualizer stream={microphoneStream} />}
    </div>
  );
};

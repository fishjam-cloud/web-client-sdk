import { useCamera, useMicrophone } from "@fishjam-cloud/react-client";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";

import AudioVisualizer from "./AudioVisualizer";
import { BlurToggleButton } from "./BlurToggle";
import { DeviceSelect } from "./DeviceSelect";
import { ToggleButton } from "./ToggleButton";
import VideoPlayer from "./VideoPlayer";

export const CameraSettings = () => {
  const {
    cameraStream,
    cameraDevices,
    selectCamera,
    currentCamera,
    toggleCamera,
    isCameraOn,
  } = useCamera();

  const hasValidDevices = cameraDevices.some((device) => device.deviceId);

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <ToggleButton
        subject="camera"
        onClick={toggleCamera}
        Icon={isCameraOn ? VideoOff : Video}
        isOn={isCameraOn}
      />
      <DeviceSelect
        devices={cameraDevices}
        onSelectDevice={selectCamera}
        defaultDevice={currentCamera ?? cameraDevices[0]}
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
    currentMicrophone,
    toggleMicrophone,
    isMicrophoneOn,
  } = useMicrophone();

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <ToggleButton
        subject="microphone"
        onClick={toggleMicrophone}
        Icon={isMicrophoneOn ? MicOff : Mic}
        isOn={isMicrophoneOn}
      />

      <DeviceSelect
        devices={microphoneDevices}
        defaultDevice={currentMicrophone ?? microphoneDevices[0]}
        onSelectDevice={selectMicrophone}
      />

      {microphoneStream && <AudioVisualizer stream={microphoneStream} />}
    </div>
  );
};

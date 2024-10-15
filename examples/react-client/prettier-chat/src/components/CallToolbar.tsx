import {
  PhoneOff,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  Video,
  VideoOff,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  useScreenShare,
  useCamera,
  useMicrophone,
  useDisconnect,
} from "@fishjam-cloud/react-client";
import { useNavigate } from "react-router-dom";

export const CallToolbar = () => {
  const navigate = useNavigate();
  const disconnect = useDisconnect();

  const onHangUp = async () => {
    disconnect();
    navigate("/");
  };

  const {
    startStreaming,
    stream: screenStream,
    stopStreaming,
  } = useScreenShare();
  const { toggleDevice: toggleCamera, stream: cameraStream } = useCamera();
  const { toggleDevice: toggleMic, stream: micStream } = useMicrophone();

  const MicIcon = micStream ? Mic : MicOff;
  const CameraIcon = cameraStream ? Video : VideoOff;
  const ScreenshareIcon = screenStream ? MonitorOff : MonitorUp;

  return (
    <footer className="h-24 flex justify-center items-center gap-8 border-t border-stone-200">
      <Button
        className="text-xs gap-2"
        variant={micStream ? "default" : "outline"}
        onClick={toggleMic}
      >
        <MicIcon size={20} strokeWidth={"1.5px"} />
        <span>Toggle microphone</span>
      </Button>

      <Button
        className="text-xs gap-2"
        variant={cameraStream ? "default" : "outline"}
        onClick={toggleCamera}
      >
        <CameraIcon size={20} strokeWidth={"1.5px"} />
        <span>Toggle camera</span>
      </Button>

      <Button
        className="text-xs gap-2"
        onClick={() => (screenStream ? stopStreaming() : startStreaming())}
      >
        <ScreenshareIcon size={20} strokeWidth={"1.5px"} />
        <span>Share your screen</span>
      </Button>

      <Button
        className="text-xs gap-2"
        variant="destructive"
        onClick={onHangUp}
      >
        <PhoneOff size={20} strokeWidth={"1.5px"} />
        <span>Hang up</span>
      </Button>
    </footer>
  );
};

import {
  PhoneOff,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  Video,
  VideoOff,
  Settings,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  useScreenShare,
  useCamera,
  useMicrophone,
  useDisconnect,
} from "@fishjam-cloud/react-client";
import { SettingsSheet } from "./SettingsSheet";

export const CallToolbar = () => {
  const disconnect = useDisconnect();

  const onHangUp = async () => {
    disconnect();
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
      <SettingsSheet>
        <Button className="text-xs gap-2 mr-4" variant="default" asChild>
          <div>
            <Settings size={20} strokeWidth={"1.5px"} />
          </div>
        </Button>
      </SettingsSheet>

      <Button
        className="text-xs gap-2"
        variant={micStream ? "default" : "outline"}
        onClick={toggleMic}
      >
        <MicIcon size={20} strokeWidth={"1.5px"} />
      </Button>

      <Button
        className="text-xs gap-2"
        variant={cameraStream ? "default" : "outline"}
        onClick={toggleCamera}
      >
        <CameraIcon size={20} strokeWidth={"1.5px"} />
      </Button>

      <Button
        className="text-xs gap-2"
        onClick={() => (screenStream ? stopStreaming() : startStreaming())}
      >
        <ScreenshareIcon size={20} strokeWidth={"1.5px"} />
      </Button>

      <Button
        className="text-xs gap-2 ml-4"
        variant="destructive"
        onClick={onHangUp}
      >
        <PhoneOff size={20} strokeWidth={"1.5px"} />
        <span>Hang up</span>
      </Button>
    </footer>
  );
};

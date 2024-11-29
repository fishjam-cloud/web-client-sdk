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
  useConnection,
} from "@fishjam-cloud/react-client";
import { SettingsSheet } from "./SettingsSheet";

export const CallToolbar = () => {
  const { leaveRoom } = useConnection();

  const onHangUp = async () => {
    leaveRoom();
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

  const toggleScreenShare = async () => {
    if (screenStream) return stopStreaming();
    try {
      await startStreaming();
    } catch (error) {
      if (error instanceof Error && error.name === "NotAllowedError") return;
      console.error(error);
    }
  };

  return (
    <footer className="flex h-24 items-center justify-center gap-8 border-t border-stone-200">
      <SettingsSheet>
        <Button className="mr-4 gap-2 text-xs" variant="default" asChild>
          <div>
            <Settings size={20} strokeWidth={"1.5px"} />
          </div>
        </Button>
      </SettingsSheet>

      <Button
        className="gap-2 text-xs"
        variant={micStream ? "default" : "outline"}
        onClick={toggleMic}
      >
        <MicIcon size={20} strokeWidth={"1.5px"} />
      </Button>

      <Button
        className="gap-2 text-xs"
        variant={cameraStream ? "default" : "outline"}
        onClick={toggleCamera}
      >
        <CameraIcon size={20} strokeWidth={"1.5px"} />
      </Button>

      <Button className="gap-2 text-xs" onClick={toggleScreenShare}>
        <ScreenshareIcon size={20} strokeWidth={"1.5px"} />
      </Button>

      <Button
        className="ml-4 gap-2 text-xs"
        variant="destructive"
        onClick={onHangUp}
      >
        <PhoneOff size={20} strokeWidth={"1.5px"} />
        <span>Hang up</span>
      </Button>
    </footer>
  );
};

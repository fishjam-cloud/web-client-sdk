import {
  useCamera,
  useConnection,
  useMicrophone,
  useScreenShare,
} from "@fishjam-cloud/react-client";
import {
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  PhoneOff,
  Settings,
  Video,
  VideoOff,
} from "lucide-react";

import { SettingsSheet } from "./SettingsSheet";
import { Button } from "./ui/button";

export const CallToolbar = () => {
  const { leaveRoom } = useConnection();

  const {
    startStreaming,
    stream: screenStream,
    stopStreaming,
  } = useScreenShare();

  const { toggleCamera, isCameraOn } = useCamera();

  const { toggleMicrophoneMute, isMicrophoneMuted } = useMicrophone();

  const onHangUp = async () => {
    leaveRoom();
  };

  const MicIcon = !isMicrophoneMuted ? Mic : MicOff;
  const CameraIcon = !isCameraOn ? Video : VideoOff;
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
        variant={!isMicrophoneMuted ? "default" : "outline"}
        onClick={toggleMicrophoneMute}
      >
        <MicIcon size={20} strokeWidth={"1.5px"} />
      </Button>

      <Button
        className="gap-2 text-xs"
        variant={!isCameraOn ? "default" : "outline"}
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

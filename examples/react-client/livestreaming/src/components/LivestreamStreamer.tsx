import type { StreamerInputs } from "@fishjam-cloud/react-client";
import {
  useCamera,
  useInitializeDevices,
  useLivestreamStreamer,
  useMicrophone,
  useSandbox,
} from "@fishjam-cloud/react-client";
import { AlertCircleIcon, Loader2, MessageCircleWarning } from "lucide-react";
import type { FC } from "react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type LivestreamStreamerProps = {
  roomName: string;
  setRoomName: (roomName: string) => void;
};

const inputsAreValid = (inputs: {
  video?: MediaStream | null;
  audio?: MediaStream | null;
}): inputs is StreamerInputs => {
  return Boolean(inputs.video || inputs.audio);
};

const LivestreamStreamer: FC<LivestreamStreamerProps> = ({
  roomName,
  setRoomName,
}) => {
  const { initializeDevices } = useInitializeDevices();
  const camera = useCamera();
  const microphone = useMicrophone();

  const [isConnecting, setIsConnecting] = useState(false);

  const { getSandboxLivestream } = useSandbox();
  const { connect, disconnect, isConnected, error } = useLivestreamStreamer();

  const initializeAndReport = useCallback(async () => {
    const { errors } = await initializeDevices();
    if (!errors) return;

    const devices = [];
    if (errors.video) devices.push("camera");
    if (errors.audio) devices.push("microphone");

    toast.error(`Failed to initialize ${devices.join(" and ")}`, {
      icon: <MessageCircleWarning size={20} />,
      position: "top-center",
    });
  }, [initializeDevices]);

  useEffect(() => {
    initializeAndReport();
  }, [initializeAndReport]);

  useEffect(() => {
    if (isConnected) toast.success("Livestream started!");
  }, [isConnected]);

  const handleStartStreaming = async () => {
    if (!roomName) {
      toast.error("Please fill in all fields");
      return;
    }

    const inputs = {
      video: camera.cameraStream,
      audio: microphone.microphoneStream,
    };
    if (!inputsAreValid(inputs)) {
      toast.error("Make sure either the camera or microphone are setup.");
      return;
    }

    setIsConnecting(true);
    try {
      const { streamerToken } = await getSandboxLivestream(roomName);
      await connect({ inputs, token: streamerToken });
    } catch (e) {
      toast.error("Failed to join the room");
      console.error(e);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleStopStreaming = () => {
    disconnect();
    toast.success("Streamer left the room");
  };

  const handleCameraChange = (deviceId: string) => {
    camera.selectCamera(deviceId);
  };

  const handleMicrophoneChange = (deviceId: string) => {
    microphone.selectMicrophone(deviceId);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Livestream Streamer</CardTitle>
        <CardDescription>Start streaming to the room</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-grow space-y-2">
            <Label htmlFor="broadcaster-room-name">Room Name</Label>
            <Input
              id="broadcaster-room-name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="my-livestream"
              disabled={isConnected}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Camera</Label>
          <Select
            value={camera.currentCamera?.deviceId}
            onValueChange={(value) => {
              handleCameraChange(value);
            }}
            disabled={isConnected}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select camera or screen share" />
            </SelectTrigger>
            <SelectContent>
              {camera.cameraDevices
                .filter((device) => device.deviceId)
                .map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || device.deviceId}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Microphone</Label>
          <Select
            value={microphone.currentMicrophone?.deviceId}
            onValueChange={handleMicrophoneChange}
            disabled={isConnected}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select microphone" />
            </SelectTrigger>
            <SelectContent>
              {microphone.microphoneDevices
                .filter((device) => device.deviceId)
                .map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || device.deviceId}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Failed to publish the stream</AlertTitle>
            <AlertDescription>
              <p className="text-muted-foreground">
                Reason: <span className="font-semibold">{error}</span>
              </p>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter>
        {!isConnected ? (
          <Button
            onClick={handleStartStreaming}
            disabled={
              isConnecting ||
              !roomName ||
              (!camera.cameraStream && !microphone.microphoneStream)
            }
            className="w-full"
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Start streaming"
            )}
          </Button>
        ) : (
          <Button
            onClick={handleStopStreaming}
            variant="destructive"
            className="w-full"
          >
            Stop Streaming
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default LivestreamStreamer;

import {
  useCamera,
  useConnection,
  useInitializeDevices,
  useMicrophone,
} from "@fishjam-cloud/react-client";
import { Loader2, MessageCircleWarning } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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

interface BroadcasterProps {
  onViewerTokenCreated: (viewerToken: string) => void;
}

const Broadcaster = ({ onViewerTokenCreated }: BroadcasterProps) => {
  const { joinRoom, leaveRoom, peerStatus } = useConnection();
  const { initializeDevices } = useInitializeDevices();
  const camera = useCamera();
  const microphone = useMicrophone();

  const [roomManagerUrl, setRoomManagerUrl] = useState("");
  const [roomName, setRoomName] = useState("example-livestream");
  const [peerName, setPeerName] = useState("The Streamer");
  const [isConnecting, setIsConnecting] = useState(false);

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

  const createRoomAndPeer = async (
    roomManager: string,
    peer: string,
    room: string,
  ) => {
    const url = new URL(roomManager);
    url.searchParams.set("roomName", room);
    url.searchParams.set("peerName", peer);
    url.searchParams.set("roomType", "livestream");
    const response = await fetch(url.toString());
    const { url: fishjamUrl, peerToken } = await response.json();
    return { fishjamUrl, peerToken };
  };

  const createViewerToken = async (roomManager: string, room: string) => {
    const response = await fetch(
      `${roomManager}/${room}/livestream-viewer-token`,
    );

    const data: { token: string } = await response.json();
    return data.token;
  };

  const handleJoinRoom = async () => {
    if (!roomManagerUrl || !roomName || !peerName) {
      toast.error("Please fill in all fields");
      return;
    }
    setIsConnecting(true);
    try {
      const { fishjamUrl, peerToken } = await createRoomAndPeer(
        roomManagerUrl,
        peerName,
        roomName,
      );

      await joinRoom({
        url: fishjamUrl,
        peerToken,
        peerMetadata: { displayName: peerName },
      });

      const viewerToken = await createViewerToken(roomManagerUrl, roomName);
      onViewerTokenCreated(viewerToken);

      toast.success("Connected to the livestream room!");
    } catch (error) {
      toast.error("Failed to join the room");
      console.error(error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    toast.success("Streamer left the room");
  };

  const handleCameraChange = (deviceId: string) => {
    camera.selectCamera(deviceId);
  };

  const handleMicrophoneChange = (deviceId: string) => {
    microphone.selectMicrophone(deviceId);
  };

  const isConnected = peerStatus === "connected";

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Broadcaster</CardTitle>
        <CardDescription>Start streaming to the room</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="broadcaster-room-manager">Room Manager URL</Label>
          <Input
            id="broadcaster-room-manager"
            value={roomManagerUrl}
            onChange={(e) => setRoomManagerUrl(e.target.value)}
            placeholder="https://fishjam.io/api/v1/connect/<your-app-id>/room-manager"
            disabled={isConnected}
          />
        </div>
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
          <div className="flex-grow space-y-2">
            <Label htmlFor="broadcaster-peer-name">Your Name</Label>
            <Input
              id="broadcaster-peer-name"
              value={peerName}
              onChange={(e) => setPeerName(e.target.value)}
              placeholder="Broadcaster"
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
              {camera.cameraDevices.map((device) => (
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
              {microphone.microphoneDevices.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label || device.deviceId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>

      <CardFooter>
        {!isConnected ? (
          <Button
            onClick={handleJoinRoom}
            disabled={isConnecting || !roomManagerUrl || !roomName || !peerName}
            className="w-full"
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Start Broadcasting"
            )}
          </Button>
        ) : (
          <Button
            onClick={handleLeaveRoom}
            variant="destructive"
            className="w-full"
          >
            Stop Broadcasting
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default Broadcaster;

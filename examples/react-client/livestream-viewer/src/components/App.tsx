import { useLivestream, useConnection, useInitializeDevices } from "@fishjam-cloud/react-client";
import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, MessageCircleWarning } from "lucide-react";

import VideoPlayer from "./VideoPlayer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

// Broadcaster component
const Broadcaster = () => {
  const { joinRoom, leaveRoom, peerStatus } = useConnection();
  const { initializeDevices } = useInitializeDevices();
  const [roomManagerUrl, setRoomManagerUrl] = useState("");
  const [roomName, setRoomName] = useState("");
  const [peerName, setPeerName] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const initializeAndReport = useCallback(async () => {
    const { errors } = await initializeDevices({
      enableVideo: true,
      enableAudio: true,
    });
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

  const handleJoinRoom = async () => {
    if (!roomManagerUrl || !roomName || !peerName) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsConnecting(true);
    try {
      // Simple room manager simulation - in real app you'd call your room manager API
      const url = new URL(roomManagerUrl);
      url.searchParams.set("roomName", roomName);
      url.searchParams.set("peerName", peerName);
      url.searchParams.set("roomType", "livestream");

      const response = await fetch(url.toString());
      const { url: fishjamUrl, peerToken } = await response.json();

      await joinRoom({
        url: fishjamUrl,
        peerToken,
        peerMetadata: { displayName: peerName },
      });

      toast.success("Connected to room!");
    } catch (error) {
      toast.error("Failed to join room");
      console.error(error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    toast.success("Left room");
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
            placeholder="https://your-room-manager.com/api/room"
            disabled={isConnected}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="broadcaster-room-name">Room Name</Label>
          <Input
            id="broadcaster-room-name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="my-livestream"
            disabled={isConnected}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="broadcaster-peer-name">Your Name</Label>
          <Input
            id="broadcaster-peer-name"
            value={peerName}
            onChange={(e) => setPeerName(e.target.value)}
            placeholder="Broadcaster"
            disabled={isConnected}
          />
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

// Livestream Viewer component
const LivestreamViewer = () => {
  const [token, setToken] = useState("");
  const [url, setUrl] = useState("https://fishjam.io/api/v1/live/api/whep");
  const { connect, disconnect, stream } = useLivestream();

  const handleConnect = () => {
    if (!token || !url) {
      toast.error("Please fill in all fields");
      return;
    }
    try {
      connect(url, token);
      toast.success("Connected to livestream!");
    } catch (error) {
      toast.error("Failed to connect to livestream");
      console.error(error);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    toast.success("Disconnected from livestream");
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Livestream Viewer</CardTitle>
        <CardDescription>Watch the live stream</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="viewer-url">WHEP URL</Label>
          <Input
            id="viewer-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://fishjam.io/api/v1/live/api/whep"
            disabled={!!stream}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="viewer-token">Token</Label>
          <Input
            id="viewer-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Your WHEP token"
            disabled={!!stream}
          />
        </div>
        {stream && (
          <div className="space-y-2">
            <Label>Live Stream</Label>
            <VideoPlayer stream={stream} />
          </div>
        )}
      </CardContent>
      <CardFooter>
        {!stream ? (
          <Button 
            onClick={handleConnect} 
            disabled={!token || !url}
            className="w-full"
          >
            Connect to Stream
          </Button>
        ) : (
          <Button 
            onClick={handleDisconnect} 
            variant="destructive"
            className="w-full"
          >
            Disconnect
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export const App = () => {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Fishjam Livestream Demo</h1>
          <p className="mt-2 text-gray-600">
            Broadcast and view live streams with Fishjam
          </p>
        </div>
        
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Broadcaster />
          <LivestreamViewer />
        </div>
      </div>
    </div>
  );
};

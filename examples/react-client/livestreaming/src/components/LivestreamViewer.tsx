import { useLivestreamViewer, useSandbox } from "@fishjam-cloud/react-client";
import { AlertCircleIcon } from "lucide-react";
import type { FC } from "react";
import { useState } from "react";
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
import VideoPlayer from "./VideoPlayer";

type LivestreamViewerProps = {
  roomName: string;
};

const LivestreamViewer: FC<LivestreamViewerProps> = ({
  roomName: streamerRoomName,
}) => {
  const { connect, disconnect, stream, error } = useLivestreamViewer();
  const { getSandboxViewerToken } = useSandbox();
  const [nameOverriden, setNameOverriden] = useState(false);
  const [roomName, setRoomName] = useState(streamerRoomName);

  if (!nameOverriden && roomName != streamerRoomName)
    setRoomName(streamerRoomName);

  const handleConnect = async () => {
    if (!roomName) {
      toast.error("Please fill in all fields");
      return;
    }
    const token = await getSandboxViewerToken(roomName);
    await connect({ token });
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
      <div className="flex flex-col justify-between h-full">
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="viewer-room-name">Room Name</Label>
            <Input
              id="viewer-room-name"
              value={roomName}
              onChange={(e) => {
                setNameOverriden(true);
                setRoomName(e.target.value);
              }}
              placeholder="Stream you want to watch"
              disabled={!!stream}
            />
            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Failed to view the stream</AlertTitle>
                <AlertDescription>
                  <p className="text-muted-foreground">
                    Reason: <span className="font-semibold">{error}</span>
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </div>
          <div className="space-y-2">
            <Label>
              {stream ? "Livestream" : "Livestream will appear here"}
            </Label>
            {stream && (
              <VideoPlayer className="h-42 rounded-sm" stream={stream} />
            )}
          </div>
        </CardContent>
        <CardFooter>
          {!stream ? (
            <Button
              onClick={handleConnect}
              disabled={!roomName}
              className="w-full"
            >
              Connect to stream
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
      </div>
    </Card>
  );
};

export default LivestreamViewer;

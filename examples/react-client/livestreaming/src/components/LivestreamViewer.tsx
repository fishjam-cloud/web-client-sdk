import { useLivestream } from "@fishjam-cloud/react-client";
import { AlertCircleIcon } from "lucide-react";
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

const FISHJAM_WHEP_URL = "https://fishjam.io/api/v1/live/api/whep";

interface LivestreamViewerProps {
  viewerToken: string;
  setViewerToken: (value: string) => void;
}

const LivestreamViewer = ({
  viewerToken,
  setViewerToken,
}: LivestreamViewerProps) => {
  const { connect, disconnect, stream, error } = useLivestream();

  const handleConnect = async () => {
    if (!viewerToken) {
      toast.error("Please fill in all fields");
      return;
    }
    await connect(FISHJAM_WHEP_URL, viewerToken);
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
            <Label htmlFor="viewer-token">Token</Label>
            <Input
              id="viewer-token"
              value={viewerToken}
              onChange={(e) => setViewerToken(e.target.value)}
              placeholder="Your viewer token"
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
            )}{" "}
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
              disabled={!viewerToken}
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
      </div>
    </Card>
  );
};

export default LivestreamViewer;

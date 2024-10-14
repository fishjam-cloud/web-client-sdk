import { useInitializeDevices, useCamera } from "@fishjam-cloud/react-client";
import { useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import VideoPlayer from "./VideoPlayer";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Label } from "./ui/label";

type Props = React.HTMLAttributes<HTMLDivElement>;

export function JoinRoomCard(props: Props) {
  const { initializeDevices } = useInitializeDevices();
  const { stream } = useCamera();

  useEffect(() => {
    initializeDevices();
  }, [initializeDevices]);

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>Fishjam Chat</CardTitle>
        <CardDescription>Fill out the form to join the room.</CardDescription>
      </CardHeader>

      <CardContent>
        <form>
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="roomManagerUrl">Room Manager URL</Label>
              <Input
                id="roomManagerUrl"
                placeholder="Url of your Room Manager"
              />
            </div>

            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="roomName">Room name</Label>
              <Input id="roomName" placeholder="Name of your room" />
            </div>

            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="userName">User name</Label>
              <Input id="userName" placeholder="Your name" />
            </div>
          </div>
        </form>

        <Separator className="my-8" />

        <Label>Video preview</Label>
        {stream && <VideoPlayer className="rounded-md" stream={stream} />}
      </CardContent>

      <CardFooter className="flex justify-end">
        <Button>Join room</Button>
      </CardFooter>
    </Card>
  );
}

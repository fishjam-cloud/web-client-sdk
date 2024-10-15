import {
  useInitializeDevices,
  useCamera,
  useMicrophone,
  useConnect,
} from "@fishjam-cloud/react-client";

import { Loader2 } from "lucide-react";

import { FC, useEffect } from "react";
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
import { Label } from "./ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";

import { DeviceSelect } from "./DeviceSelect";
import AudioVisualizer from "./AudioVisualizer";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { getRoomCredentials } from "@/lib/roomManager";
import { RoomForm } from "@/types";
import { getPersistedFormValues, persistFormValues } from "@/lib/utils";

type Props = React.HTMLAttributes<HTMLDivElement>;

export const JoinRoomCard: FC<Props> = (props) => {
  const [params] = useSearchParams();

  const { initializeDevices } = useInitializeDevices();

  const connect = useConnect();
  const navigate = useNavigate();

  const persistedValues = getPersistedFormValues();
  const defaultValues = {
    ...persistedValues,
    roomManagerUrl:
      params.get("roomManagerUrl") ?? persistedValues.roomManagerUrl,
  };

  const form = useForm<RoomForm>({
    defaultValues,
  });

  const {
    stream: cameraStream,
    devices: cameraDevices,
    initialize: initCamera,
    activeDevice: activeCamera,
  } = useCamera();

  const {
    stream: micStream,
    devices: micDevices,
    initialize: initMic,
    activeDevice: activeMic,
  } = useMicrophone();

  useEffect(() => {
    initializeDevices();
  }, [initializeDevices]);

  const onJoinRoom = async ({
    roomManagerUrl,
    roomName,
    peerName,
  }: RoomForm) => {
    const { url, peerToken } = await getRoomCredentials(
      roomManagerUrl,
      roomName,
      peerName
    );
    persistFormValues({ roomManagerUrl, roomName, peerName });
    await connect({ url, token: peerToken });
    const encodedUrl = encodeURIComponent(url);
    navigate(`/room?token=${peerToken}&url=${encodedUrl}`);
  };

  return (
    <Card {...props}>
      <form onSubmit={form.handleSubmit(onJoinRoom)}>
        <CardHeader>
          <CardTitle>Fishjam Chat</CardTitle>
          <CardDescription>Fill out the form to join the call.</CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="roomManagerUrl">Room Manager URL</Label>
              <Input
                placeholder="URL of your Room Manager"
                {...form.register("roomManagerUrl")}
              />
            </div>

            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="roomName">Room name</Label>
              <Input
                {...form.register("roomName")}
                placeholder="Name of your room"
              />
            </div>

            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="peerName">User name</Label>
              <Input {...form.register("peerName")} placeholder="Your name" />
            </div>
          </div>

          <Accordion type="single" collapsible className="mt-4">
            <AccordionItem value="item-1">
              <AccordionTrigger>Camera settings</AccordionTrigger>
              <AccordionContent className="space-y-4">
                <DeviceSelect
                  devices={cameraDevices}
                  onSelectDevice={initCamera}
                  defaultDevice={activeCamera ?? cameraDevices[0]}
                />

                {cameraStream && (
                  <VideoPlayer className="rounded-md" stream={cameraStream} />
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger>Microphone settings</AccordionTrigger>

              <AccordionContent className="flex justify-center flex-col items-center gap-4">
                <DeviceSelect
                  devices={micDevices}
                  onSelectDevice={initMic}
                  defaultDevice={activeMic ?? micDevices[0]}
                />

                {micStream && <AudioVisualizer stream={micStream} />}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>

        <CardFooter className="flex justify-end">
          <Button
            disabled={form.formState.isSubmitting}
            type="submit"
            className="w-24"
          >
            {form.formState.isSubmitting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <span>Join room</span>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

import {
  useCamera,
  useConnection,
  useInitializeDevices,
  useMicrophone,
} from "@fishjam-cloud/react-client";
import { Loader2 } from "lucide-react";
import type { FC } from "react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { useAutoConnect } from "@/hooks/useAutoConnect";
import { getRoomCredentials } from "@/lib/roomManager";
import { getPersistedFormValues, persistFormValues } from "@/lib/utils";
import type { RoomForm } from "@/types";

import { CameraSettings, MicrophoneSettings } from "./DeviceSettings";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
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

type Props = React.HTMLAttributes<HTMLDivElement>;

export const JoinRoomCard: FC<Props> = (props) => {
  const { initializeDevices } = useInitializeDevices();

  const camera = useCamera();
  const mic = useMicrophone();

  const { joinRoom } = useConnection();

  const persistedValues = getPersistedFormValues();
  const defaultValues = {
    ...persistedValues,
  };

  const form = useForm<RoomForm>({
    defaultValues,
  });

  useEffect(() => {
    initializeDevices();
  }, [initializeDevices]);

  useAutoConnect();

  const onJoinRoom = async ({
    roomManagerUrl,
    roomName,
    peerName,
  }: RoomForm) => {
    try {
      const { url, peerToken } = await getRoomCredentials(
        roomManagerUrl,
        roomName,
        peerName,
      );
      persistFormValues({ roomManagerUrl, roomName, peerName });
      await joinRoom({
        url,
        peerToken,
        peerMetadata: { displayName: peerName },
      });

      await Promise.all([
        camera.startStreaming({ simulcast: false }),
        mic.startStreaming({ simulcast: false }),
      ]);
      form.clearErrors();
    } catch (e) {
      form.setError("root", { message: (e as { message?: string })?.message });
    }
  };

  const error = form.formState.errors.root?.message;

  return (
    <Card {...props}>
      <form onSubmit={form.handleSubmit(onJoinRoom)}>
        <CardHeader>
          <CardTitle>Fishjam Chat</CardTitle>
          <CardDescription>Fill out the form to join the call.</CardDescription>
          {error && <CardFooter className="text-red-500">{error}</CardFooter>}
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
              <AccordionContent>
                <CameraSettings />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger>Microphone settings</AccordionTrigger>

              <AccordionContent>
                <MicrophoneSettings />
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

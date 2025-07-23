import {
  type RoomType,
  useConnection,
  useInitializeDevices,
  useSandbox,
} from "@fishjam-cloud/react-client";
import { Loader2, MessageCircleWarning } from "lucide-react";
import type { FC } from "react";
import { useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";

type Props = React.HTMLAttributes<HTMLDivElement>;

export const JoinRoomCard: FC<Props> = (props) => {
  const { initializeDevices } = useInitializeDevices();

  const { joinRoom } = useConnection();

  const persistedValues = getPersistedFormValues();

  const defaultValues = {
    ...persistedValues,
  };

  const form = useForm<RoomForm>({
    defaultValues,
  });

  const overridenFishjamUrl = form.watch("override")
    ? form.watch("fishjamUrl")
    : undefined;

  const { getSandboxPeerToken } = useSandbox({
    configOverride: { fishjamUrl: overridenFishjamUrl },
  });

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

  const onJoinRoom = async ({
    roomName,
    peerName,
    roomType,
    fishjamId,
    override,
    fishjamUrl,
    roomManagerUrl,
  }: RoomForm) => {
    const peerToken = await getSandboxPeerToken(roomName, peerName, roomType);

    persistFormValues({
      roomName,
      peerName,
      roomType,
      fishjamId,
      override,
      fishjamUrl,
      roomManagerUrl,
    });

    await joinRoom({
      peerToken,
      peerMetadata: { displayName: peerName },
      ...(override ? { fishjamUrl } : {}),
    });
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
              <Label htmlFor="fishjamId">Fishjam ID</Label>

              <Input {...form.register("fishjamId")} placeholder="Fishjam ID" />
            </div>

            <div className="flex flex-row items-center justify-between rounded-lg">
              <div className="space-y-0.5">
                <Label>Override Fishjam ID</Label>
              </div>
              <div>
                <Switch
                  checked={form.watch("override")}
                  onCheckedChange={(checked) =>
                    form.setValue("override", checked)
                  }
                />
              </div>
            </div>

            {form.watch("override") && (
              <>
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="fishjamUrl">Fishjam URL</Label>

                  <Input
                    {...form.register("fishjamUrl")}
                    placeholder="Fishjam URL"
                  />
                </div>
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="roomManagerUrl">Room Manager URL</Label>

                  <Input
                    {...form.register("roomManagerUrl")}
                    placeholder="Room Manager URL"
                  />
                </div>
              </>
            )}

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
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="roomType">Room type</Label>

              <Select
                value={form.watch("roomType")}
                onValueChange={(value) =>
                  form.setValue("roomType", value as RoomType)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select room type" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="conference">Conference</SelectItem>
                  <SelectItem value="audio_only">Audio only</SelectItem>
                  <SelectItem value="livestream">Livestream</SelectItem>
                </SelectContent>
              </Select>
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

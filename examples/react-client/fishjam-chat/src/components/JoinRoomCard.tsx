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

type Props = React.HTMLAttributes<HTMLDivElement> & {
  onFishjamIdChange: (fishjamId: string) => void;
};

export const JoinRoomCard: FC<Props> = ({ onFishjamIdChange, ...props }) => {
  const { initializeDevices } = useInitializeDevices();

  const { joinRoom } = useConnection();

  const persistedValues = getPersistedFormValues();

  const defaultValues = {
    ...persistedValues,
  };

  const form = useForm<RoomForm>({
    defaultValues,
  });
  const formFishjamId = form.watch("fishjamId");

  useEffect(() => {
    onFishjamIdChange(formFishjamId);
  }, [formFishjamId, onFishjamIdChange]);

  const configOverride = form.watch("override")
    ? { sandboxApiUrl: form.watch("fishjamUrl") }
    : undefined;

  const { getSandboxPeerToken } = useSandbox({
    configOverride,
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
  }: RoomForm) => {
    const peerToken = await getSandboxPeerToken(roomName, peerName, roomType);

    persistFormValues({
      roomName,
      peerName,
      roomType,
      fishjamId,
      override,
      fishjamUrl,
    });

    const url = form.watch("override")
      ? form.watch("fishjamUrl")?.replace("http", "ws")
      : undefined;

    await joinRoom({
      url,
      peerToken,
      peerMetadata: { displayName: peerName },
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
            {form.watch("override") ? (
              <div className="flex flex-1 flex-col space-y-1.5">
                <Label htmlFor="fishjamUrl">Fishjam URL</Label>

                <Input
                  key="fishjamUrl"
                  {...form.register("fishjamUrl")}
                  placeholder="Fishjam URL"
                />
              </div>
            ) : (
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="fishjamId">Fishjam ID</Label>

                <Input
                  key="fishjamId"
                  {...form.register("fishjamId")}
                  placeholder="Fishjam ID"
                />
              </div>
            )}

            <Button
              type="button"
              className="w-full"
              variant="outline"
              onClick={() => form.setValue("override", !form.watch("override"))}
            >
              {form.watch("override")
                ? "Use Fishjam ID"
                : "Override Fishjam ID"}
            </Button>

            <div className="flex flex-row space-x-2">
              <div className="flex flex-1 flex-col space-y-1.5">
                <Label htmlFor="roomName">Room name</Label>

                <Input
                  {...form.register("roomName")}
                  placeholder="Name of your room"
                />
              </div>

              <div className="flex flex-1 flex-col space-y-1.5">
                <Label htmlFor="peerName">User name</Label>

                <Input {...form.register("peerName")} placeholder="Your name" />
              </div>
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

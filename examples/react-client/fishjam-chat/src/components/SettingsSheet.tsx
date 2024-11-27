import type { FC, PropsWithChildren } from "react";
import {
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Sheet,
} from "./ui/sheet";
import { Label } from "./ui/label";
import { CameraSettings, MicrophoneSettings } from "./DeviceSettings";

export const SettingsSheet: FC<PropsWithChildren> = ({ children }) => {
  return (
    <Sheet>
      <SheetTrigger>{children}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Adjust your camera, microphone, and other settings.
          </SheetDescription>
        </SheetHeader>

        <section className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Camera settings</Label>

            <CameraSettings />
          </div>

          <div className="space-y-2">
            <Label>Microphone settings</Label>

            <MicrophoneSettings />
          </div>
        </section>
      </SheetContent>
    </Sheet>
  );
};

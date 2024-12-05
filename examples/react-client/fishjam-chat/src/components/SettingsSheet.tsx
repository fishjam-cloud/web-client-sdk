import type { FC, PropsWithChildren } from "react";

import { CameraSettings, MicrophoneSettings } from "./DeviceSettings";
import { Label } from "./ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

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

        <section className="mt-4 space-y-4">
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

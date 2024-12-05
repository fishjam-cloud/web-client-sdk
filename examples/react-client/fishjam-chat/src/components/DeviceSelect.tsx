import type { FC } from "react";

import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type Props = {
  devices: MediaDeviceInfo[];
  onSelectDevice: (deviceId: string) => void;
  defaultDevice: MediaDeviceInfo | null;
};

export const DeviceSelect: FC<Props> = ({
  devices,
  onSelectDevice,
  defaultDevice,
}) => {
  const validDevices = devices.filter((device) => device.deviceId);

  if (!validDevices.length)
    return <Label>No devices found, check browser permissions.</Label>;

  return (
    <Select
      onValueChange={onSelectDevice}
      defaultValue={defaultDevice?.deviceId}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select device" />
      </SelectTrigger>
      <SelectContent>
        {validDevices.map((device) => (
          <SelectItem key={device.deviceId} value={device.deviceId}>
            {device.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

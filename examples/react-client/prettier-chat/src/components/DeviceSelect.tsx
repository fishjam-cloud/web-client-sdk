import { FC } from "react";
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
  return (
    <Select
      onValueChange={onSelectDevice}
      defaultValue={defaultDevice?.deviceId}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select device" />
      </SelectTrigger>
      <SelectContent>
        {devices.map((device) => (
          <SelectItem key={device.deviceId} value={device.deviceId}>
            {device.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

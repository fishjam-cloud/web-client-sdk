import type { ChangeEvent } from "react";
import { useState } from "react";

type Props = {
  name: string;
  defaultOptionText: string;
  devices: MediaDeviceInfo[] | null;
  stop: () => void;
  setInput: (value: string | null) => void;
  activeDevice: string | null;
};

export const DeviceSelector = ({ name, devices, setInput, defaultOptionText, activeDevice, stop }: Props) => {
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  const onOptionChangeHandler = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedDevice(event?.target?.value);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row">
        <span>Selected: {activeDevice}</span>
      </div>
      <div className="flex flex-row items-center gap-2">
        <span>{name}</span>
        <select className="select w-full max-w-xs" onChange={onOptionChangeHandler} defaultValue={defaultOptionText}>
          <option disabled>{defaultOptionText}</option>
          {(devices || []).map(({ deviceId, label }) => (
            <option key={deviceId} value={deviceId}>
              {label}
            </option>
          ))}
        </select>
        <button
          className="btn btn-success btn-sm"
          disabled={!selectedDevice}
          onClick={() => {
            setInput(selectedDevice);
          }}
        >
          start / change
        </button>
        <button
          className="btn btn-error btn-sm"
          disabled={!selectedDevice}
          onClick={() => {
            stop();
          }}
        >
          stop
        </button>
      </div>
    </div>
  );
};

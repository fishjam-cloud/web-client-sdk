import { ChangeEvent, useState } from "react";

type Props = {
  name: string;
  defaultOptionText: string;
  devices: MediaDeviceInfo[] | null;
  setInput: (value: string | null) => void;
  // inputValue: string | null;
};

export const DeviceSelector = ({ name, devices, setInput, defaultOptionText }: Props) => {
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  const onOptionChangeHandler = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedDevice(event?.target?.value);
  };

  return (
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
        className="btn btn-error btn-sm"
        disabled={!selectedDevice}
        onClick={() => {
          setInput(selectedDevice);
        }}
      >
        Change device!
      </button>
    </div>
  );
};

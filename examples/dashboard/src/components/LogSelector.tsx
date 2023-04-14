import { useState } from "react";
import { getBooleanValue } from "../utils/localStorageUtils";

export const useLocalStorageState = (name: string): [boolean, (newValue: boolean) => void] => {
  const [value, setValueState] = useState<boolean>(getBooleanValue(name));

  const setValue = (newValue: boolean) => {
    setValueState(newValue);
    localStorage.setItem(name, newValue.toString());
  };

  return [value, setValue];
};

export const getStringValue = (name: string, defaultValue: string | null = null): string | null => {
  const stringValue = localStorage.getItem(name);
  if (stringValue === null || stringValue === undefined) {
    return defaultValue;
  }
  return stringValue;
};

export const useLocalStorageStateString = (name: string): [string | null, (newValue: string | null) => void] => {
  const [value, setValueState] = useState<string | null>(getStringValue(name));

  const setValue = (newValue: string | null) => {
    setValueState(newValue);
    if (newValue === null) {
      localStorage.removeItem(name);
    } else {
      localStorage.setItem(name, newValue);
    }
  };

  return [value, setValue];
};

export const LogSelector = () => {
  return (
    <div className="card bg-base-100 shadow-xl flex flex-col m-2">
      <div className="card-body mt-4">
        <PersistentInput name="onJoinSuccess" />
        <PersistentInput name="onJoinError" />
        <PersistentInput name="onRemoved" />
        <PersistentInput name="onPeerJoined" />
        <PersistentInput name="onPeerLeft" />
        <PersistentInput name="onPeerUpdated" />
        <PersistentInput name="onTrackReady" />
        <PersistentInput name="onTrackAdded" />
        <PersistentInput name="onTrackRemoved" />
        <PersistentInput name="onTrackUpdated" />
        <PersistentInput name="onTrackEncodingChanged" />
        <PersistentInput name="onTracksPriorityChanged" />
        <PersistentInput name="onBandwidthEstimationChanged" />
        <PersistentInput name="onEncodingChanged" />
      </div>
    </div>
  );
};

export const PersistentInput = ({ name }: { name: string }) => {
  const [value, setValue] = useLocalStorageState(name);

  return (
    <div className="form-control flex flex-row flex-wrap content-center">
      <label className="label cursor-pointer">
        <input
          className="checkbox"
          id={name}
          type="checkbox"
          checked={value}
          onChange={() => {
            setValue(!value);
          }}
        />
        <span className="label-text ml-2">{name}</span>
      </label>
    </div>
  );
};

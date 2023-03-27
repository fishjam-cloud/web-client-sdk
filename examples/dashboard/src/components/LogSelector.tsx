import { useState } from "react";
import { getBooleanValue } from "../../../../src/jellyfish/addLogging";

export const useLocalStorageState = (
  name: string
): [boolean, (newValue: boolean) => void] => {
  const [value, setValueState] = useState<boolean>(getBooleanValue(name));

  const setValue = (newValue: boolean) => {
    setValueState(newValue);
    localStorage.setItem(name, newValue.toString());
  };

  return [value, setValue];
};
export const LogSelector = () => {
  return (
    <div className="card w-96 bg-base-100 shadow-xl flex flex-col m-1 p-4">
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

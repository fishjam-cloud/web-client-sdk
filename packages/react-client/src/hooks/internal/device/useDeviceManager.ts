import { useCallback, useRef, useSyncExternalStore } from "react";

import type { DeviceManager, DeviceManagerEvents } from "../../../devices/DeviceManager";
import type { DeviceManagerState } from "../../../types/internal";

const eventNames = [
  "deviceDisabled",
  "deviceEnabled",
  "managerStarted",
  "deviceStopped",
  "deviceReady",
  "devicesStarted",
  "devicesReady",
  "managerInitialized",
  "error",
  "middlewareSet",
] as const satisfies (keyof DeviceManagerEvents)[];

export const useDeviceManager = (deviceManager: DeviceManager) => {
  const mutationRef = useRef(false);

  const subscribe = useCallback(
    (subscribeCallback: () => void) => {
      const callback = () => {
        mutationRef.current = true;
        subscribeCallback();
      };
      eventNames.forEach((eventName) => deviceManager.on(eventName, callback));

      return () => {
        eventNames.forEach((eventName) => deviceManager.removeListener(eventName, callback));
      };
    },
    [deviceManager],
  );

  const lastSnapshotRef = useRef<DeviceManagerState | null>(null);

  const getSnapshot: () => DeviceManagerState = useCallback(() => {
    if (mutationRef.current || lastSnapshotRef.current === null) {
      lastSnapshotRef.current = {
        deviceState: deviceManager.getState(),
        deviceStatus: deviceManager.getStatus(),
        deviceType: deviceManager.getDeviceType(),
      };
      mutationRef.current = false;
    }

    return lastSnapshotRef.current;
  }, [deviceManager]);

  const deviceState = useSyncExternalStore(subscribe, getSnapshot);

  return deviceState;
};

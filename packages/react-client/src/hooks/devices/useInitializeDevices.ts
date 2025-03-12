import { useContext } from "react";

import { InitDevicesContext } from "../../contexts/initDevices";
import { type DeviceError } from "../../types/public";

export type UseInitializeDevicesParams = {
  enableVideo?: boolean;
  enableAudio?: boolean;
};

export type InitializeDevicesErrors = { audio: DeviceError | null; video: DeviceError | null };

/**
 * Hook allows you to initialize access to the devices before joining the room.
 * @category Devices
 */
export const useInitializeDevices = () => {
  const initializeDevices = useContext(InitDevicesContext);
  if (!initializeDevices) throw Error("useInitializeDevices must be used within FishjamProvider");

  return {
    /**
     * Initialize access to the devices before joining the room
     */
    initializeDevices,
  };
};

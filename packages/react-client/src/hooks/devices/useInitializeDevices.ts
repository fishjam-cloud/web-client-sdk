import { useContext } from "react";

import { InitDevicesContext } from "../../contexts/initDevices";

export type UseInitializeDevicesParams = {
  enableVideo?: boolean;
  enableAudio?: boolean;
};

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

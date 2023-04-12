import { MediaType } from "./types";
import { useMemo } from "react";
import { useMedia } from "./useMedia";

/**
 * Hook that returns the media stream and methods to control it, depending on the passed id of device and type.
 *
 * @param type - type of media stream
 * @param deviceId - id of device
 * @returns object containing information about the media stream and methods to control it
 */
export const useUserMediaById = (type: MediaType, deviceId: string | null) => {
  const media = useMemo(
    () => (deviceId ? () => navigator.mediaDevices.getUserMedia({ [type]: { deviceId } }) : null),
    [deviceId, type]
  );
  return useMedia(media);
};

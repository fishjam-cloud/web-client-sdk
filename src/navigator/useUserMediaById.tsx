import { MediaType } from "./types";
import { useMemo } from "react";
import { useMedia } from "./useMedia";

export const useUserMediaById = (type: MediaType, deviceId: string | null) => {
  const media = useMemo(
    () => (deviceId ? () => navigator.mediaDevices.getUserMedia({ [type]: { deviceId } }) : null),
    [deviceId, type]
  );
  return useMedia(media);
};

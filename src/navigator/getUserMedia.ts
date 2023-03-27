import { MediaType } from "./types";

export const getUserMedia = async (deviceId: string, type: MediaType): Promise<MediaStream> =>
  // todo handle navigator is undefined
  await navigator.mediaDevices.getUserMedia({ [type]: { deviceId } });

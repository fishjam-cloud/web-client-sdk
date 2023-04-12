import { MediaType } from "./types";

/**
 * Get media stream from provided device id and media type.
 *
 * @param deviceId - id of device to get stream from
 * @param type - type of media to get stream from
 * @returns Promise with {@link MediaStream}
 *
 * @example
 * getUserMedia("123", "video").then((stream) => {
 *  console.log(stream);
 * });
 */
export const getUserMedia = async (deviceId: string, type: MediaType): Promise<MediaStream> =>
  // todo handle navigator is undefined
  await navigator.mediaDevices.getUserMedia({ [type]: { deviceId } });

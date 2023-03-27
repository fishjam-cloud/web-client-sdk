export type DeviceReturnType =
  | { type: "OK"; devices: MediaDeviceInfo[] }
  | { type: "Error"; message: string | null }
  | { type: "Not requested" };

export type EnumerateDevices = {
  audio: DeviceReturnType;
  video: DeviceReturnType;
};
export type MediaType = "audio" | "video";

import { prepareConstraints } from "./constraints";
import type { DeviceItem, IDeviceManager, PlatformMediaStream } from "./deviceManager";
import { DeviceError, DeviceOverconstrainedError, DevicePermissionDeniedError, UnknownDeviceError } from "./errors";

type AudioVideo<T> = { audio: T; video: T };

type MediaConstraints = AudioVideo<MediaTrackConstraints | undefined | boolean>;
type PreviousDevices = AudioVideo<DeviceItem | null>;

export type GetMediaResult = { stream: PlatformMediaStream | null; errors: AudioVideo<DeviceError | null> };

const defaultErrors: AudioVideo<DeviceError | null> = { audio: null, video: null };

// The device manager rejects with classified DeviceError instances (see
// IDeviceManager), so this module only routes on `error.name`.
const asDeviceError = (error: unknown): DeviceError =>
  error instanceof DeviceError ? error : new UnknownDeviceError({ cause: error });

const getSingleMedia = async <T extends "audio" | "video">(
  deviceManager: IDeviceManager<PlatformMediaStream>,
  type: T,
  constraints: MediaStreamConstraints[T],
): Promise<[PlatformMediaStream, null] | [null, DeviceError]> => {
  const baseConstraints = { audio: undefined, video: undefined };

  try {
    const stream = await deviceManager.getUserMedia({ ...baseConstraints, [type]: constraints });
    return [stream, null];
  } catch (err) {
    return [null, asDeviceError(err)];
  }
};

const tryToGetAudioOnlyThenVideoOnly = async (
  deviceManager: IDeviceManager<PlatformMediaStream>,
  constraints: MediaStreamConstraints,
  initialError: DeviceError,
): Promise<GetMediaResult> => {
  const [audioStream, audioError] = await getSingleMedia(deviceManager, "audio", constraints.audio);
  if (audioStream) return { stream: audioStream, errors: { video: initialError, audio: null } };

  const [videoStream, videoError] = await getSingleMedia(deviceManager, "video", constraints.video);
  return { stream: videoStream, errors: { audio: audioError, video: videoError } };
};

export const getAvailableMedia = async (
  deviceManager: IDeviceManager<PlatformMediaStream>,
  constraints: MediaStreamConstraints,
  errors: AudioVideo<DeviceError | null> = defaultErrors,
): Promise<GetMediaResult> => {
  try {
    return { stream: await deviceManager.getUserMedia(constraints), errors };
  } catch (err: unknown) {
    const deviceError = asDeviceError(err);
    switch (deviceError.name) {
      case errors.audio?.name:
      case errors.video?.name:
        return { stream: null, errors };
      case "NotFoundError":
      case "NotAllowedError":
        return tryToGetAudioOnlyThenVideoOnly(
          deviceManager,
          constraints,
          new DevicePermissionDeniedError({ cause: err }),
        );
      case "OverconstrainedError":
        return getAvailableMedia(
          deviceManager,
          { audio: unspecifyDevice(constraints.audio), video: unspecifyDevice(constraints.video) },
          { audio: deviceError, video: new DeviceOverconstrainedError({ cause: err }) },
        );
      default:
        return { stream: null, errors: { audio: deviceError, video: new UnknownDeviceError({ cause: err }) } };
    }
  }
};

/**
 * Re-acquires the last session's persisted devices when the initial
 * acquisition landed on different ones.
 *
 * Device ids are not stable across sessions (see {@link DeviceItem}), so a
 * stale persisted id can make the platform silently hand out a default
 * device. Persisted devices are re-matched against the current enumeration by
 * label; when found, the acquired tracks are stopped and the persisted
 * devices are re-acquired with exact ids. Runs only during device
 * initialization — labels only become visible once an acquisition has been
 * granted, which is what forces this recover-after-acquire ordering.
 */
export const recoverPersistedDevices = async (
  deviceManager: IDeviceManager<PlatformMediaStream>,
  stream: PlatformMediaStream,
  errors: AudioVideo<DeviceError | null>,
  devices: DeviceItem[],
  constraints: MediaConstraints,
  previousDevices: PreviousDevices,
): Promise<GetMediaResult> => {
  const shouldCorrectDevices = isAnyDeviceDifferentFromLastSession(
    previousDevices.video,
    previousDevices.audio,
    getCurrentDevicesSettings(stream, devices),
  );

  if (!shouldCorrectDevices) return { stream, errors };

  const videoIdToStart = devices.find((device) => device.label === previousDevices.video?.label)?.deviceId;
  const audioIdToStart = devices.find((device) => device.label === previousDevices.audio?.label)?.deviceId;

  if (!videoIdToStart && !audioIdToStart) return { stream, errors };

  stopTracks(stream);

  const exactConstraints: MediaStreamConstraints = {
    video: !errors.video && prepareConstraints(videoIdToStart, constraints.video),
    audio: !errors.audio && prepareConstraints(audioIdToStart, constraints.audio),
  };

  return await getAvailableMedia(deviceManager, exactConstraints, errors);
};

type CurrentDevices = AudioVideo<DeviceItem | null>;

const getCurrentDevicesSettings = (
  requestedDevices: PlatformMediaStream,
  availableDevices: DeviceItem[],
): CurrentDevices => {
  const currentDevices: CurrentDevices = { video: null, audio: null };

  for (const track of requestedDevices.getTracks()) {
    const settings = track.getSettings();
    if (settings.deviceId) {
      const currentDevice = availableDevices.find((device) => device.deviceId == settings.deviceId);
      if (currentDevice && (currentDevice.kind === "video" || currentDevice.kind === "audio")) {
        currentDevices[currentDevice.kind] = currentDevice;
      }
    }
  }
  return currentDevices;
};

const isDeviceDifferentFromLastSession = (lastDevice: DeviceItem | null, currentDevice: DeviceItem | null) =>
  lastDevice && (currentDevice?.deviceId !== lastDevice.deviceId || currentDevice?.label !== lastDevice?.label);

const isAnyDeviceDifferentFromLastSession = (
  lastVideoDevice: DeviceItem | null,
  lastAudioDevice: DeviceItem | null,
  currentDevices: CurrentDevices | null,
): boolean =>
  !!(
    (currentDevices?.video && isDeviceDifferentFromLastSession(lastVideoDevice, currentDevices?.video || null)) ||
    (currentDevices?.audio && isDeviceDifferentFromLastSession(lastAudioDevice, currentDevices?.audio || null))
  );

const stopTracks = (requestedDevices: PlatformMediaStream) => {
  for (const track of requestedDevices.getTracks()) {
    track.stop();
  }
};

const unspecifyDevice = (
  trackConstraints?: boolean | MediaTrackConstraints,
): boolean | MediaTrackConstraints | undefined => {
  if (typeof trackConstraints === "object") {
    return { ...trackConstraints, deviceId: undefined };
  }
  return trackConstraints;
};

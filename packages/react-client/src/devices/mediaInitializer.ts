import type { CurrentDevices, DeviceError } from "../types/internal";
import { NOT_FOUND_ERROR, OVERCONSTRAINED_ERROR, PERMISSION_DENIED, UNHANDLED_ERROR } from "../utils/errors";
import { prepareConstraints } from "./constraints";

type AudioVideo<T> = { audio: T; video: T };

type MediaConstraints = AudioVideo<MediaTrackConstraints | undefined | boolean>;

type PreviousDevices = AudioVideo<MediaDeviceInfo | null>;

const defaultErrors = { audio: null, video: null };

const tryToGetAudioOnlyThenVideoOnly = async (
  constraints: MediaStreamConstraints,
  deviceErrors: AudioVideo<DeviceError | null> = defaultErrors,
  transformConstraint: (value?: boolean | MediaTrackConstraints) => boolean | MediaTrackConstraints | undefined = () =>
    false,
) => {
  const audioOnly = await getAvailableMedia(
    { ...constraints, video: transformConstraint(constraints.video) },
    { ...deviceErrors, audio: null },
  );
  if (audioOnly[0]) return audioOnly;

  return getAvailableMedia(
    { ...constraints, audio: transformConstraint(constraints.audio) },
    { ...deviceErrors, video: null },
  );
};

export const getAvailableMedia = async (
  constraints: MediaStreamConstraints,
  deviceErrors: AudioVideo<DeviceError | null> = defaultErrors,
): Promise<[MediaStream | null, AudioVideo<DeviceError | null>]> => {
  try {
    return [await navigator.mediaDevices.getUserMedia(constraints), deviceErrors];
  } catch (err: unknown) {
    if (!(err instanceof DOMException)) return [null, { audio: UNHANDLED_ERROR, video: UNHANDLED_ERROR }];

    if (err.name === deviceErrors.audio?.name || err.name === deviceErrors.video?.name) return [null, deviceErrors];

    switch (err.name) {
      case "NotFoundError":
        return tryToGetAudioOnlyThenVideoOnly(constraints, { audio: NOT_FOUND_ERROR, video: NOT_FOUND_ERROR });
      case "OverconstrainedError":
        return tryToGetAudioOnlyThenVideoOnly(
          constraints,
          { audio: OVERCONSTRAINED_ERROR, video: OVERCONSTRAINED_ERROR },
          removeSpecifiedDeviceFromConstraints,
        );
      case "NotAllowedError":
        return tryToGetAudioOnlyThenVideoOnly(constraints, { audio: PERMISSION_DENIED, video: PERMISSION_DENIED });
      default:
        return [null, { audio: UNHANDLED_ERROR, video: UNHANDLED_ERROR }];
    }
  }
};

// Safari changes deviceId between sessions, therefore we cannot rely on deviceId for identification purposes.
// We can switch a random device that comes from safari to one that has the same label as the one used in the previous session.
export const getCorrectedResult = async (
  stream: MediaStream,
  deviceErrors: AudioVideo<DeviceError | null>,
  devices: MediaDeviceInfo[],
  constraints: MediaConstraints,
  previousDevices: PreviousDevices,
): Promise<[MediaStream | null, AudioVideo<DeviceError | null>]> => {
  const shouldCorrectDevices = isAnyDeviceDifferentFromLastSession(
    previousDevices.video,
    previousDevices.audio,
    getCurrentDevicesSettings(stream, devices),
  );

  if (!shouldCorrectDevices) return [stream, deviceErrors];

  const videoIdToStart = devices.find((info) => info.label === previousDevices.video?.label)?.deviceId;
  const audioIdToStart = devices.find((info) => info.label === previousDevices.audio?.label)?.deviceId;

  if (!videoIdToStart && !audioIdToStart) return [stream, deviceErrors];

  stopTracks(stream);

  const exactConstraints: MediaStreamConstraints = {
    video: !deviceErrors.video && prepareConstraints(videoIdToStart, constraints.video),
    audio: !deviceErrors.audio && prepareConstraints(audioIdToStart, constraints.audio),
  };

  return await getAvailableMedia(exactConstraints, deviceErrors);
};

const getCurrentDevicesSettings = (
  requestedDevices: MediaStream,
  mediaDeviceInfos: MediaDeviceInfo[],
): CurrentDevices => {
  const currentDevices: CurrentDevices = { videoinput: null, audioinput: null };

  for (const track of requestedDevices.getTracks()) {
    const settings = track.getSettings();
    if (settings.deviceId) {
      const currentDevice = mediaDeviceInfos.find((device) => device.deviceId == settings.deviceId);
      const kind = currentDevice?.kind ?? null;
      if ((currentDevice && kind === "videoinput") || kind === "audioinput") {
        currentDevices[kind] = currentDevice ?? null;
      }
    }
  }
  return currentDevices;
};

const isDeviceDifferentFromLastSession = (lastDevice: MediaDeviceInfo | null, currentDevice: MediaDeviceInfo | null) =>
  lastDevice && (currentDevice?.deviceId !== lastDevice.deviceId || currentDevice?.label !== lastDevice?.label);

const isAnyDeviceDifferentFromLastSession = (
  lastVideoDevice: MediaDeviceInfo | null,
  lastAudioDevice: MediaDeviceInfo | null,
  currentDevices: CurrentDevices | null,
): boolean =>
  !!(
    (currentDevices?.videoinput &&
      isDeviceDifferentFromLastSession(lastVideoDevice, currentDevices?.videoinput || null)) ||
    (currentDevices?.audioinput &&
      isDeviceDifferentFromLastSession(lastAudioDevice, currentDevices?.audioinput || null))
  );

const stopTracks = (requestedDevices: MediaStream) => {
  for (const track of requestedDevices.getTracks()) {
    track.stop();
  }
};

const removeSpecifiedDeviceFromConstraints = (
  trackConstraints?: boolean | MediaTrackConstraints,
): boolean | MediaTrackConstraints | undefined => {
  if (typeof trackConstraints === "object") {
    return { ...trackConstraints, deviceId: undefined };
  }
  return trackConstraints;
};

import type { AudioVideo, CurrentDevices } from "../types/internal";
import type { DeviceError } from "../types/public";
import { NOT_FOUND_ERROR, OVERCONSTRAINED_ERROR, PERMISSION_DENIED, UNHANDLED_ERROR } from "../utils/errors";
import { prepareConstraints } from "./constraints";

type MediaConstraints = AudioVideo<MediaTrackConstraints | undefined | boolean>;
type PreviousDevices = AudioVideo<MediaDeviceInfo | null>;

type GetMediaResult = { stream: MediaStream | null; errors: AudioVideo<DeviceError | null> };

const defaultErrors = { audio: null, video: null };

const errorMap: Record<string, DeviceError> = {
  NotFoundError: NOT_FOUND_ERROR,
  OverconstrainedError: OVERCONSTRAINED_ERROR,
  NotAllowedError: PERMISSION_DENIED,
};

const getSingleMedia = async <T extends "audio" | "video">(
  type: T,
  constraints: MediaStreamConstraints[T],
): Promise<[MediaStream, null] | [null, DeviceError]> => {
  const baseConstraints = { audio: undefined, video: undefined };

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ ...baseConstraints, [type]: constraints });
    return [stream, null];
  } catch (err) {
    return [null, errorMap[(err as Error).name] ?? UNHANDLED_ERROR];
  }
};

const tryToGetAudioOnlyThenVideoOnly = async (
  constraints: MediaStreamConstraints,
  initialError: DeviceError,
): Promise<GetMediaResult> => {
  const [audioStream, audioErr] = await getSingleMedia("audio", constraints.audio);
  if (audioStream) return { stream: audioStream, errors: { video: initialError, audio: null } };

  const [videoStream, videoErr] = await getSingleMedia("video", constraints.video);
  return { stream: videoStream, errors: { audio: audioErr, video: videoErr } };
};

export const getAvailableMedia = async (
  constraints: MediaStreamConstraints,
  errors: AudioVideo<DeviceError | null> = defaultErrors,
): Promise<GetMediaResult> => {
  try {
    return { stream: await navigator.mediaDevices.getUserMedia(constraints), errors };
  } catch (err: unknown) {
    switch ((err as Error).name) {
      case errors.audio?.name:
      case errors.video?.name:
        return { stream: null, errors };
      case "NotFoundError":
        return tryToGetAudioOnlyThenVideoOnly(constraints, PERMISSION_DENIED);
      case "OverconstrainedError":
        return getAvailableMedia(
          { audio: unspecifyDevice(constraints.audio), video: unspecifyDevice(constraints.video) },
          { audio: OVERCONSTRAINED_ERROR, video: OVERCONSTRAINED_ERROR },
        );
      case "NotAllowedError":
        return tryToGetAudioOnlyThenVideoOnly(constraints, PERMISSION_DENIED);
      default:
        return { stream: null, errors: { audio: UNHANDLED_ERROR, video: UNHANDLED_ERROR } };
    }
  }
};

// Safari changes deviceId between sessions, therefore we cannot rely on deviceId for identification purposes.
// We can switch a random device that comes from safari to one that has the same label as the one used in the previous session.
export const correctDevicesOnSafari = async (
  stream: MediaStream,
  errors: AudioVideo<DeviceError | null>,
  devices: MediaDeviceInfo[],
  constraints: MediaConstraints,
  previousDevices: PreviousDevices,
): Promise<GetMediaResult> => {
  const shouldCorrectDevices = isAnyDeviceDifferentFromLastSession(
    previousDevices.video,
    previousDevices.audio,
    getCurrentDevicesSettings(stream, devices),
  );

  if (!shouldCorrectDevices) return { stream, errors };

  const videoIdToStart = devices.find((info) => info.label === previousDevices.video?.label)?.deviceId;
  const audioIdToStart = devices.find((info) => info.label === previousDevices.audio?.label)?.deviceId;

  if (!videoIdToStart && !audioIdToStart) return { stream, errors };

  stopTracks(stream);

  const exactConstraints: MediaStreamConstraints = {
    video: !errors.video && prepareConstraints(videoIdToStart, constraints.video),
    audio: !errors.audio && prepareConstraints(audioIdToStart, constraints.audio),
  };

  return await getAvailableMedia(exactConstraints, errors);
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

const unspecifyDevice = (
  trackConstraints?: boolean | MediaTrackConstraints,
): boolean | MediaTrackConstraints | undefined => {
  if (typeof trackConstraints === "object") {
    return { ...trackConstraints, deviceId: undefined };
  }
  return trackConstraints;
};

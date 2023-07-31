export const AUDIO_TRACK_CONSTRAINTS: MediaTrackConstraints = {
  advanced: [{ autoGainControl: true }, { noiseSuppression: true }, { echoCancellation: true }],
};

export const VIDEO_TRACK_CONSTRAINTS: MediaTrackConstraints = {
  width: {
    max: 1280,
    ideal: 1280,
    min: 640,
  },
  height: {
    max: 720,
    ideal: 720,
    min: 320,
  },
  frameRate: {
    max: 30,
    ideal: 24,
  },
};

export const toMediaTrackConstraints = (
  constraint?: boolean | MediaTrackConstraints
): MediaTrackConstraints | undefined => {
  if (typeof constraint === "boolean") {
    return constraint ? {} : undefined;
  }
  return constraint;
};

export const prepareMediaTrackConstraints = (
  deviceId: string | undefined,
  constraints: MediaTrackConstraints | undefined
): MediaTrackConstraints | boolean => {
  if (!deviceId) return false;
  const exactId: Pick<MediaTrackConstraints, "deviceId"> = deviceId ? { deviceId: { exact: deviceId } } : {};
  return { ...constraints, ...exactId };
};

export const getExactDeviceConstraint = (
  constraints: MediaTrackConstraints | undefined,
  deviceId: string | undefined
) => ({
  ...constraints,
  deviceId: { exact: deviceId },
});

export const prepareConstraints = (
  deviceIdToStart: string | undefined,
  constraints: MediaTrackConstraints | undefined
): MediaTrackConstraints | undefined | boolean => {
  return deviceIdToStart ? getExactDeviceConstraint(constraints, deviceIdToStart) : constraints;
};

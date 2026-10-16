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

export const prepareConstraints = (
  deviceIdToStart: string | undefined,
  constraints: MediaTrackConstraints | undefined | boolean,
): MediaTrackConstraints | undefined | boolean => {
  if (!deviceIdToStart) return constraints;

  // The resulting stream will not contain a track of this type,
  // which means that the device will not be activated.
  if (constraints === false) return false;

  const constraintsObject = constraints === true ? {} : constraints;

  return { ...constraintsObject, deviceId: { ideal: deviceIdToStart } };
};

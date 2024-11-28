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

export const SCREEN_SHARING_MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    frameRate: { ideal: 20, max: 25 },
    width: { max: 1920, ideal: 1920 },
    height: { max: 1080, ideal: 1080 },
  },
};

export const prepareMediaTrackConstraints = (
  deviceId: string | undefined,
  constraints: MediaTrackConstraints | undefined | boolean,
): MediaTrackConstraints | boolean => {
  const trackConstraints = typeof constraints === "boolean" ? {} : constraints;

  if (!deviceId) return { ...trackConstraints };

  return { ...trackConstraints, deviceId: { exact: deviceId } };
};

export const prepareConstraints = (
  deviceIdToStart: string | undefined,
  constraints: MediaTrackConstraints | undefined | boolean,
): MediaTrackConstraints | undefined | boolean => {
  if (!deviceIdToStart) return constraints;

  // The resulting stream will not contain a track of this type,
  // which means that the device will not be activated.
  if (constraints === false) return false;

  const constraintsObj = constraints === true ? {} : constraints;

  return { ...constraintsObj, deviceId: { ideal: deviceIdToStart } };
};

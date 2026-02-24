import { permissions } from '@fishjam-cloud/react-native-webrtc';

export const patchGetUserMediaWithPermissionWarnings = () => {
  const original = globalThis.navigator.mediaDevices.getUserMedia.bind(globalThis.navigator.mediaDevices);

  globalThis.navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    try {
      const [cameraStatus, micStatus] = await Promise.all([
        constraints?.video ? permissions.query({ name: 'camera' }) : null,
        constraints?.audio ? permissions.query({ name: 'microphone' }) : null,
      ]);

      if (cameraStatus && cameraStatus !== 'granted') {
        console.warn(`Attempting to access camera with permission status: "${cameraStatus}".`);
      }
      if (micStatus && micStatus !== 'granted') {
        console.warn(`Attempting to access microphone with permission status: "${micStatus}".`);
      }
    } catch (error) {
      console.warn('Failed to check permissions before getUserMedia', error);
    }

    return original(constraints);
  };
};

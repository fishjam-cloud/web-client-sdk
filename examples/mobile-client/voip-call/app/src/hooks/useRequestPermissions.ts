import {
  useCameraPermissions,
  useMicrophonePermissions,
} from '@fishjam-cloud/react-native-client';
import { useEffect } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

/** Requests the camera, microphone, and (Android 13+) notification permissions once. */
export function useRequestPermissions(): void {
  const [, requestCamera] = useCameraPermissions();
  const [, requestMicrophone] = useMicrophonePermissions();

  useEffect(() => {
    (async () => {
      const microphoneStatus = await requestMicrophone();
      if (microphoneStatus !== 'granted') {
        console.warn('Microphone permission not granted — calls will be muted');
      }
      const cameraStatus = await requestCamera();
      if (cameraStatus !== 'granted') {
        console.warn('Camera permission not granted — video will be disabled');
      }
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      }
    })().catch((err) => console.error('Failed to request permissions:', err));
  }, [requestCamera, requestMicrophone]);
}

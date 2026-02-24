import { permissions } from '@fishjam-cloud/react-native-webrtc';
import { useCallback } from 'react';

type PermissionStatus = 'granted' | 'denied' | 'prompt';

function usePermission(
  name: 'camera' | 'microphone',
): [query: () => Promise<PermissionStatus>, request: () => Promise<PermissionStatus>] {
  const query = useCallback(async (): Promise<PermissionStatus> => {
    return (await permissions.query({ name })) as PermissionStatus;
  }, [name]);

  const request = useCallback(async (): Promise<PermissionStatus> => {
    await permissions.request({ name });
    return (await permissions.query({ name })) as PermissionStatus;
  }, [name]);

  return [query, request];
}

export function useCameraPermissions() {
  return usePermission('camera');
}

export function useMicrophonePermissions() {
  return usePermission('microphone');
}

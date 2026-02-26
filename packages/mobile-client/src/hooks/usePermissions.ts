import { permissions } from '@fishjam-cloud/react-native-webrtc';
import { useCallback } from 'react';

/**
 * The current status of a device permission.
 *
 * - `'granted'` – the user has granted the permission.
 * - `'denied'` – the user has denied the permission.
 * - `'prompt'` – the user has not yet been asked (or the permission can be requested again).
 */
export type PermissionStatus = 'granted' | 'denied' | 'prompt';

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

/**
 * Hook for querying and requesting camera permission on the device.
 *
 * @returns A tuple of `[query, request]`:
 * - `query` – checks the current camera permission status without prompting the user.
 * - `request` – triggers the native permission dialog and returns the resulting status.
 *
 * @example
 * ```tsx
 * const [queryCameraPermission, requestCameraPermission] = useCameraPermissions();
 *
 * const status = await queryCameraPermission();
 * if (status !== 'granted') {
 *   await requestCameraPermission();
 * }
 * ```
 */
export function useCameraPermissions() {
  return usePermission('camera');
}

/**
 * Hook for querying and requesting microphone permission on the device.
 *
 * @returns A tuple of `[query, request]`:
 * - `query` – checks the current microphone permission status without prompting the user.
 * - `request` – triggers the native permission dialog and returns the resulting status.
 *
 * @example
 * ```tsx
 * const [queryMicPermission, requestMicPermission] = useMicrophonePermissions();
 *
 * const status = await queryMicPermission();
 * if (status !== 'granted') {
 *   await requestMicPermission();
 * }
 * ```
 */
export function useMicrophonePermissions() {
  return usePermission('microphone');
}

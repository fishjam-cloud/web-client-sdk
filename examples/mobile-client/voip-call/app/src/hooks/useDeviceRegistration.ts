import { useVoip } from '@fishjam-cloud/react-native-client';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useUser } from '../user/UserContext';

const SERVER_URL =
  process.env.EXPO_PUBLIC_VOIP_SERVER_URL ?? 'http://localhost:4400';

/**
 * Registers this device's VoIP push token with the signaling server so other
 * users can ring it.
 */
export function useDeviceRegistration(): void {
  const { username } = useUser();
  const { voipToken } = useVoip();

  useEffect(() => {
    if (!username || !voipToken) return;
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    fetch(`${SERVER_URL}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, voipToken, platform: Platform.OS }),
    }).catch(() => {});
  }, [username, voipToken]);
}

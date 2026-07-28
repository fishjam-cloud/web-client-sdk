import { useVoIP } from '@fishjam-cloud/react-native-client';
import { useEffect } from 'react';

import { useUser } from '../user/UserContext';
import { usePlaceCall } from './usePlaceCall';

/**
 * Places a call when the user redials from the iOS Recents list. The SDK holds the
 * intent until we are ready, so we can simply wait for the session to be restored.
 */
export function useRecentsRedial(): void {
  const { pendingCallIntent, clearCallIntent } = useVoIP();
  const { username } = useUser();
  const placeCall = usePlaceCall();

  useEffect(() => {
    if (!pendingCallIntent || !username) return;

    const { handle } = pendingCallIntent;
    clearCallIntent();
    placeCall(handle).catch((err) =>
      console.error('[voip] failed to start call from a Recents intent:', err),
    );
  }, [pendingCallIntent, username, clearCallIntent, placeCall]);
}

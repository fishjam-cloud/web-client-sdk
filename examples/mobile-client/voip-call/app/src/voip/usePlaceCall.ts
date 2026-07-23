import { useVoip } from '@fishjam-cloud/react-native-client';
import { useCallback } from 'react';

import { useUser } from '../user';

const SERVER_URL =
  process.env.EXPO_PUBLIC_VOIP_SERVER_URL ?? 'http://localhost:4400';

/** Must match the `isVideo` prop passed to `VoipProvider` in App.tsx. */
export const IS_VIDEO_CALL = true;

/** Random room name for the call. The app owns this, the SDK never mints one. */
function makeRoomName() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `voip-${id}`;
}

/**
 * Places an outgoing call: rings the callee through our own signaling server first,
 * then reports the call to CallKit/Telecom via `startCall`.
 *
 * The order matters and is ours to choose. `startCall` only touches the native call
 * UI, so if signaling fails we never show a call that cannot connect.
 */
export function usePlaceCall(): (to: string) => Promise<void> {
  const { startCall } = useVoip();
  const { username } = useUser();

  return useCallback(
    async (to: string) => {
      const roomName = makeRoomName();

      const res = await fetch(`${SERVER_URL}/call`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          from: username,
          to,
          roomName,
          isVideo: IS_VIDEO_CALL,
        }),
      });
      if (!res.ok) throw new Error('Failed to initiate call');

      await startCall(to, roomName);
    },
    [startCall, username],
  );
}

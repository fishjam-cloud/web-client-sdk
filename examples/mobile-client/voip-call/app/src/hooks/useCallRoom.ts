import {
  useCamera,
  useConnection,
  useMicrophone,
  useSandbox,
  useVoip,
} from '@fishjam-cloud/react-native-client';
import { useEffect, useState } from 'react';

import { useUser } from '../user/UserContext';
import { IS_VIDEO_CALL } from './usePlaceCall';

const SANDBOX_API_URL = process.env.EXPO_PUBLIC_SANDBOX_API_URL ?? '';

// Serializes joins and leaves. React runs an effect's cleanup before the next effect
// body, but `leaveRoom` and the media teardown are async — without this chain an
// "End & Accept" swap when accepting waiting call while we are in an ongoing one
// could start joining the new room while the old one is still being torn down, and
// we would briefly be in two rooms. Module-level so the leave scheduled by an
// unmounting `CallScreen` still runs before the next call's join.
let roomOperations: Promise<void> = Promise.resolve();

/**
 * Ties room membership to the caller's mount lifetime: joins the current call's room
 * (starting media first) on mount, leaves and stops media on unmount, and swaps rooms
 * when `currentCall` moves to a different one.
 *
 * Call from the screen that is visible for exactly the duration of a call.
 * Returns the room we have actually joined, or `null` while still connecting.
 */
export function useCallRoom(): string | null {
  const { currentCall, reportConnectFailed } = useVoip();
  const { username } = useUser();
  const { joinRoom, leaveRoom } = useConnection();
  const { startCamera, stopCamera } = useCamera();
  const { startMicrophone, stopMicrophone } = useMicrophone();
  const { getSandboxPeerToken } = useSandbox({
    sandboxApiUrl: SANDBOX_API_URL,
  });

  const roomName = currentCall?.roomName ?? null;
  const [joinedRoom, setJoinedRoom] = useState<string | null>(null);

  useEffect(() => {
    if (!roomName) return;
    let cancelled = false;

    roomOperations = roomOperations.then(async () => {
      if (cancelled) return;
      try {
        const peerToken = await getSandboxPeerToken(
          roomName,
          username ?? 'unknown',
          'conference',
        );
        if (cancelled) return;

        if (IS_VIDEO_CALL) await startCamera();
        await startMicrophone();
        if (cancelled) return;

        await joinRoom({ peerToken });
        if (cancelled) return;
        setJoinedRoom(roomName);
      } catch (err) {
        console.error('[voip] failed to join call room:', err);
        if (!cancelled) await reportConnectFailed();
      }
    });

    return () => {
      cancelled = true;
      setJoinedRoom(null);
      roomOperations = roomOperations.then(async () => {
        try {
          await stopCamera();
          await stopMicrophone();
          await leaveRoom();
        } catch (err) {
          console.error('[voip] failed to leave call room:', err);
        }
      });
    };
    // Only the room decides when to join or leave
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  return joinedRoom;
}

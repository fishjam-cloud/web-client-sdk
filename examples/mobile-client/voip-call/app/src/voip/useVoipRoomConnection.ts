import {
  useCamera,
  useConnection,
  useMicrophone,
  usePeers,
  useSandbox,
  useVoip,
} from '@fishjam-cloud/react-native-client';
import { useEffect, useRef, useState } from 'react';

import { useUser } from '../user';
import { IS_VIDEO_CALL, usePlaceCall } from './usePlaceCall';

const SANDBOX_API_URL = process.env.EXPO_PUBLIC_SANDBOX_API_URL ?? '';

/**
 * Drives the Fishjam connection for VoIP calls: joins the room `VoipProvider` reports
 * via `currentCall`, reports back with `reportConnected` / `reportConnectFailed`, and
 * applies hold and mute to our tracks.
 *
 * Mount once, anywhere inside `VoipProvider`.
 */
export function useVoipRoomConnection(): void {
  const {
    status,
    currentCall,
    isOnHold,
    isMuted,
    pendingCallIntent,
    clearCallIntent,
    reportConnected,
    reportConnectFailed,
    endCall,
  } = useVoip();

  const { username } = useUser();
  const { joinRoom, leaveRoom } = useConnection();
  const { isCameraOn, startCamera, stopCamera, toggleCamera } = useCamera();
  const { isMicrophoneOn, startMicrophone, stopMicrophone, toggleMicrophone } =
    useMicrophone();
  const { remotePeers } = usePeers();
  const { getSandboxPeerToken } = useSandbox({
    sandboxApiUrl: SANDBOX_API_URL,
  });
  const placeCall = usePlaceCall();

  // Everything the effects below need, read through a ref so their dependency lists
  // can stay minimal — the join effect in particular must re-run only when the room
  // changes, never because a hook handed back a fresh callback identity.
  const apiRef = useRef({
    username,
    joinRoom,
    leaveRoom,
    startCamera,
    stopCamera,
    startMicrophone,
    stopMicrophone,
    isCameraOn,
    isMicrophoneOn,
    toggleCamera,
    toggleMicrophone,
    getSandboxPeerToken,
    reportConnectFailed,
  });
  apiRef.current = {
    username,
    joinRoom,
    leaveRoom,
    startCamera,
    stopCamera,
    startMicrophone,
    stopMicrophone,
    isCameraOn,
    isMicrophoneOn,
    toggleCamera,
    toggleMicrophone,
    getSandboxPeerToken,
    reportConnectFailed,
  };

  /** The room we should be joined to right now, or `null` if we should be in none. */
  const targetRoom =
    status === 'connecting' || status === 'active'
      ? (currentCall?.roomName ?? null)
      : null;

  const [joinedRoom, setJoinedRoom] = useState<string | null>(null);

  // Serializes joins and leaves. React runs an effect's cleanup before the next
  // effect body, but `leaveRoom` and the media teardown are async — without this
  // chain an "End & Accept" swap could start joining the new room while the old one
  // is still being torn down, and we would briefly be in two rooms.
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!targetRoom) return;
    let cancelled = false;

    chainRef.current = chainRef.current.then(async () => {
      if (cancelled) return;
      const api = apiRef.current;
      try {
        const peerToken = await api.getSandboxPeerToken(
          targetRoom,
          api.username ?? 'unknown',
          'conference',
        );
        if (cancelled) return;

        if (IS_VIDEO_CALL) await api.startCamera();
        await api.startMicrophone();
        if (cancelled) return;

        await api.joinRoom({ peerToken });
        setJoinedRoom(targetRoom);
      } catch (err) {
        console.error('[voip] failed to join call room:', err);
        if (!cancelled) await api.reportConnectFailed();
      }
    });

    return () => {
      cancelled = true;
      chainRef.current = chainRef.current.then(async () => {
        const api = apiRef.current;
        setJoinedRoom(null);
        try {
          await api.stopCamera();
          await api.stopMicrophone();
          await api.leaveRoom();
        } catch (err) {
          console.error('[voip] failed to leave call room:', err);
        }
      });
    };
  }, [targetRoom]);

  // The remote peer showing up is what "connected" means for us, and it going away is
  // the remote hanging up. Gated on `joinedRoom` so a stale peer list from the room we
  // just left cannot connect (or end) the room we are moving into.
  useEffect(() => {
    if (!currentCall || joinedRoom !== currentCall.roomName) return;

    if (status === 'connecting' && remotePeers.length > 0) {
      void reportConnected();
    } else if (status === 'active' && remotePeers.length === 0) {
      void endCall('remote');
    }
  }, [
    status,
    currentCall,
    joinedRoom,
    remotePeers.length,
    reportConnected,
    endCall,
  ]);

  const heldMediaRef = useRef({
    microphoneEnabled: false,
    cameraEnabled: false,
  });
  const prevOnHoldRef = useRef(false);

  useEffect(() => {
    if (prevOnHoldRef.current === isOnHold) return;
    prevOnHoldRef.current = isOnHold;

    // Only drive tracks during a live call. Ending a held call resets `isOnHold` to
    // false, and without this we would take the restore branch and re-open the very
    // devices the teardown is stopping.
    if (status !== 'active') return;

    const api = apiRef.current;
    (async () => {
      if (isOnHold) {
        heldMediaRef.current = {
          microphoneEnabled: api.isMicrophoneOn,
          cameraEnabled: api.isCameraOn,
        };
        if (api.isMicrophoneOn) await api.toggleMicrophone();
        if (api.isCameraOn) await api.toggleCamera();
      } else {
        const { microphoneEnabled, cameraEnabled } = heldMediaRef.current;
        if (microphoneEnabled) await api.toggleMicrophone();
        if (cameraEnabled) await api.toggleCamera();
      }
    })().catch((err) =>
      console.error('[voip] failed to update media for held call:', err),
    );
  }, [isOnHold, status]);

  const prevMutedRef = useRef(false);

  useEffect(() => {
    if (prevMutedRef.current === isMuted) return;
    prevMutedRef.current = isMuted;

    // Same reasoning as hold above: the reset at call end must not restart the mic.
    if (status !== 'active') return;

    const api = apiRef.current;
    if (api.isMicrophoneOn !== isMuted) return;

    api
      .toggleMicrophone()
      .catch((err) => console.error('[voip] failed to sync mute state:', err));
  }, [isMuted, status]);

  // A redial from the iOS Recents list. The SDK holds it until we are ready, so we can
  // simply wait for the session to be restored.
  useEffect(() => {
    if (!pendingCallIntent || !username) return;

    const { handle } = pendingCallIntent;
    clearCallIntent();
    placeCall(handle).catch((err) =>
      console.error('[voip] failed to start call from a Recents intent:', err),
    );
  }, [pendingCallIntent, username, clearCallIntent, placeCall]);
}

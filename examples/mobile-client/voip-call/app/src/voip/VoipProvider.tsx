import {
  useCallKit,
  useConnection,
  useMicrophone,
  useVoIPEvents,
  type VoipIncomingPayload,
} from '@fishjam-cloud/react-native-client';
import {
  type PropsWithChildren,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useUser } from '../user';
import {
  type CurrentCall,
  type VoipCallStatus,
  VoipContext,
} from './VoipContext';

type VoipProviderProps = PropsWithChildren & {
  getPeerToken: (roomName: string) => Promise<string>;
  requestCall: (params: { to: string; roomName: string }) => Promise<void>;
};

export function VoipProvider({
  getPeerToken,
  requestCall,
  children,
}: VoipProviderProps) {
  const { username } = useUser();

  const [voipToken, setVoipToken] = useState<string | null>(null);
  const [status, setStatus] = useState<VoipCallStatus>('available');
  const [currentCall, setCurrentCall] = useState<CurrentCall | null>(null);

  const currentCallRef = useRef(currentCall);
  currentCallRef.current = currentCall;
  const usernameRef = useRef(username);
  usernameRef.current = username;

  const { joinRoom, leaveRoom } = useConnection();
  const { startMicrophone, stopMicrophone } = useMicrophone();
  const { startCallKitSession, endCallKitSession } = useCallKit();

  // --- Helpers ---

  const doJoinRoom = useCallback(
    async (roomName: string) => {
      const token = await getPeerToken(roomName);
      await joinRoom({
        peerToken: token,
        peerMetadata: { displayName: usernameRef.current ?? '' },
      });
      await startMicrophone();
    },
    [getPeerToken, joinRoom, startMicrophone],
  );

  const doLeaveRoom = useCallback(async () => {
    try {
      await stopMicrophone();
    } catch {
      // ignore if mic was never started
    }
    leaveRoom();
  }, [leaveRoom, stopMicrophone]);

  const resetCall = useCallback(async () => {
    await doLeaveRoom();
    setCurrentCall(null);
    setStatus('available');
  }, [doLeaveRoom]);

  // --- Outgoing call ---

  const startCall = useCallback(
    async (to: string, roomName: string) => {
      const from = usernameRef.current;
      if (!from) throw new Error('Not registered');

      // The room name is supplied by the caller — the SDK owns no naming policy.
      await requestCall({ to, roomName });

      setCurrentCall({
        roomName,
        remoteName: to,
        direction: 'outgoing',
        startedAt: null,
      });
      setStatus('connecting');

      await startCallKitSession({ displayName: to, isVideo: false });
      await doJoinRoom(roomName);
      setCurrentCall((prev) =>
        prev ? { ...prev, startedAt: Date.now() } : prev,
      );
      setStatus('active');
    },
    [requestCall, doJoinRoom, startCallKitSession],
  );

  // --- Incoming call ---

  const answerCall = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call) return;

    setStatus('connecting');
    try {
      await doJoinRoom(call.roomName);
      setCurrentCall((prev) =>
        prev ? { ...prev, startedAt: Date.now() } : prev,
      );
      setStatus('active');
    } catch (err) {
      console.error('Failed to join room on answer:', err);
      await resetCall();
    }
  }, [doJoinRoom, resetCall]);

  const rejectCall = useCallback(async () => {
    await endCallKitSession();
    await resetCall();
  }, [endCallKitSession, resetCall]);

  // --- End call (works for both directions) ---

  const endCall = useCallback(async () => {
    await endCallKitSession();
    await doLeaveRoom();
    setCurrentCall(null);
    setStatus('available');
  }, [doLeaveRoom, endCallKitSession]);

  // --- VoIP event handlers ---

  useVoIPEvents({
    onRegistered: useCallback((token: string) => {
      setVoipToken(token);
    }, []),

    onIncoming: useCallback((payload: VoipIncomingPayload) => {
      setCurrentCall({
        roomName: payload.roomId,
        remoteName: payload.username,
        direction: 'incoming',
        startedAt: null,
      });
      setStatus('incoming');
    }, []),

    onAnswered: useCallback(async () => {
      await answerCall();
    }, [answerCall]),

    onEnded: useCallback(async () => {
      await resetCall();
    }, [resetCall]),
  });

  const voipValue = useMemo(
    () => ({
      voipToken,
      status,
      currentCall,
      startCall,
      answerCall,
      rejectCall,
      endCall,
    }),
    [
      voipToken,
      status,
      currentCall,
      startCall,
      answerCall,
      rejectCall,
      endCall,
    ],
  );

  return (
    <VoipContext.Provider value={voipValue}>{children}</VoipContext.Provider>
  );
}

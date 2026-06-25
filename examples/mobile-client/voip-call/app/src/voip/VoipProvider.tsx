import {
  useCallKit,
  useConnection,
  useMicrophone,
  usePeers,
  useVoIPEvents,
  type VoipIncomingPayload,
} from '@fishjam-cloud/react-native-client';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  type CurrentCall,
  type VoipCallStatus,
  VoipContext,
} from './VoipContext';

type VoipProviderProps = PropsWithChildren & {
  getPeerToken: (roomName: string) => Promise<string>;
  requestCall: (params: { to: string; roomName: string }) => Promise<void>;
  ringTimeoutMs?: number;
};

export function VoipProvider({
  getPeerToken,
  requestCall,
  ringTimeoutMs,
  children,
}: VoipProviderProps) {
  const [voipToken, setVoipToken] = useState<string | null>(null);
  const [status, setStatus] = useState<VoipCallStatus>('available');
  const [currentCall, setCurrentCall] = useState<CurrentCall | null>(null);

  const currentCallRef = useRef(currentCall);
  currentCallRef.current = currentCall;

  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { joinRoom, leaveRoom } = useConnection();
  const { startMicrophone, stopMicrophone } = useMicrophone();
  const { startCallKitSession, endCallKitSession } = useCallKit();
  const { remotePeers } = usePeers();

  const clearRingTimeout = useCallback(() => {
    if (ringTimeoutRef.current != null) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  }, []);

  const handleJoinRoom = useCallback(
    async (roomName: string) => {
      const token = await getPeerToken(roomName);
      await joinRoom({ peerToken: token });
      await startMicrophone();
    },
    [getPeerToken, joinRoom, startMicrophone],
  );

  const handleLeaveRoom = useCallback(async () => {
    try {
      await stopMicrophone();
    } catch {
      // ignore if mic was never started
    }
    leaveRoom();
  }, [leaveRoom, stopMicrophone]);

  const resetCall = useCallback(async () => {
    clearRingTimeout();
    await handleLeaveRoom();
    setCurrentCall(null);
    setStatus('available');
  }, [clearRingTimeout, handleLeaveRoom]);

  useEffect(() => {
    if (
      status === 'connecting' &&
      currentCallRef.current?.direction === 'outgoing' &&
      remotePeers.length > 0
    ) {
      clearRingTimeout();
      setCurrentCall((prev) =>
        prev ? { ...prev, startedAt: Date.now() } : prev,
      );
      setStatus('active');
    }
  }, [remotePeers.length, status, clearRingTimeout]);

  const startCall = useCallback(
    async (to: string, roomName: string) => {
      await requestCall({ to, roomName });

      setCurrentCall({
        roomName,
        remoteName: to,
        direction: 'outgoing',
        startedAt: null,
      });
      setStatus('connecting');

      await startCallKitSession({ displayName: to, isVideo: false });
      await handleJoinRoom(roomName);

      if (ringTimeoutMs != null) {
        clearRingTimeout();
        ringTimeoutRef.current = setTimeout(() => {
          ringTimeoutRef.current = null;
          resetCall();
        }, ringTimeoutMs);
      }
    },
    [
      requestCall,
      handleJoinRoom,
      startCallKitSession,
      clearRingTimeout,
      ringTimeoutMs,
      resetCall,
    ],
  );

  const answerCall = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call) return;

    setStatus('connecting');
    try {
      await handleJoinRoom(call.roomName);
      setCurrentCall((prev) =>
        prev ? { ...prev, startedAt: Date.now() } : prev,
      );
      setStatus('active');
    } catch (err) {
      console.error('Failed to join room on answer:', err);
      await resetCall();
    }
  }, [handleJoinRoom, resetCall]);

  const rejectCall = useCallback(async () => {
    await endCallKitSession();
    await resetCall();
  }, [endCallKitSession, resetCall]);

  const endCall = useCallback(async () => {
    clearRingTimeout();
    await endCallKitSession();
    await handleLeaveRoom();
    setCurrentCall(null);
    setStatus('available');
  }, [clearRingTimeout, handleLeaveRoom, endCallKitSession]);

  useVoIPEvents({
    onRegistered: useCallback((token: string) => {
      setVoipToken(token);
    }, []),

    onIncoming: useCallback((payload: VoipIncomingPayload) => {
      setCurrentCall({
        roomName: payload.roomName,
        remoteName: payload.displayName,
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

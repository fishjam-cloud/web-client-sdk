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
  useState,
} from 'react';

import {
  type CurrentCall,
  type VoipCallStatus,
  VoipContext,
} from './VoipContext';

type VoipProviderProps = PropsWithChildren & {
  getPeerToken: (roomName: string) => Promise<string>;
  requestCall: (params: {
    to: string;
    roomName: string;
    isVideo: boolean;
  }) => Promise<void>;
  isVideo?: boolean;
};

export function VoipProvider({
  getPeerToken,
  requestCall,
  isVideo = false,
  children,
}: VoipProviderProps) {
  const [voipToken, setVoipToken] = useState<string | null>(null);
  const [status, setStatus] = useState<VoipCallStatus>('available');
  const [currentCall, setCurrentCall] = useState<CurrentCall | null>(null);

  const { joinRoom, leaveRoom } = useConnection();
  const { startMicrophone, stopMicrophone } = useMicrophone();
  const { startCallKitSession, endCallKitSession } = useCallKit();
  const { remotePeers } = usePeers();

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
    await handleLeaveRoom();
    setCurrentCall(null);
    setStatus('available');
  }, [handleLeaveRoom]);

  useEffect(() => {
    if (status === 'connecting' && remotePeers.length > 0) {
      setCurrentCall((prev) =>
        prev ? { ...prev, startedAt: Date.now() } : prev,
      );
      setStatus('active');
    }
  }, [remotePeers.length, status]);

  const startCall = useCallback(
    async (to: string, roomName: string) => {
      await requestCall({ to, roomName, isVideo });

      setCurrentCall({
        roomName,
        displayName: to,
        isVideo,
        startedAt: null,
      });
      setStatus('connecting');

      await startCallKitSession({ displayName: to, isVideo });
      await handleJoinRoom(roomName);
    },
    [requestCall, handleJoinRoom, startCallKitSession, isVideo],
  );

  const answerCall = useCallback(async () => {
    if (!currentCall) return;

    setStatus('connecting');
    try {
      await handleJoinRoom(currentCall.roomName);
      setCurrentCall((prev) =>
        prev ? { ...prev, startedAt: Date.now() } : prev,
      );
      setStatus('active');
    } catch (err) {
      console.error('Failed to join room on answer:', err);
      await resetCall();
    }
  }, [handleJoinRoom, resetCall, currentCall]);

  const rejectCall = useCallback(async () => {
    await endCallKitSession();
    await resetCall();
  }, [endCallKitSession, resetCall]);

  const endCall = useCallback(async () => {
    await endCallKitSession();
    await handleLeaveRoom();
    setCurrentCall(null);
    setStatus('available');
  }, [handleLeaveRoom, endCallKitSession]);

  useVoIPEvents({
    onRegistered: useCallback((token: string) => {
      setVoipToken(token);
    }, []),

    onIncoming: useCallback((payload: VoipIncomingPayload) => {
      setCurrentCall({
        roomName: payload.roomName,
        displayName: payload.displayName,
        isVideo: payload.isVideo,
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

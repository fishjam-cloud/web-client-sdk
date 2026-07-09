import {
  useCallKit,
  useCamera,
  useConnection,
  useMicrophone,
  usePeers,
  useTelecom,
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
import { Platform } from 'react-native';

import {
  type CurrentCall,
  type VoipCallStatus,
  VoipContext,
} from './VoipContext';

type VoipProviderProps = PropsWithChildren & {
  /**
   * Returns a Fishjam peer token for the given room. Invoked when joining a room
   * on call start/answer. It should wrap a method that calls your backend to get the peer token for a given room.
   * Make sure to pass the correct params when obtaining the peer token, such as the room name, the peer name, and the room type.
   */
  getPeerToken: (roomName: string) => Promise<string>;
  /**
   * Asks your signaling backend to ring `to` in `roomName`. Invoked when starting
   * an outgoing call, before joining the room.
   */
  requestCall: (params: {
    to: string;
    roomName: string;
    isVideo: boolean;
  }) => Promise<void>;
  /**
   * Whether outgoing calls are video calls — reflected in the CallKit session.
   * Make sure the underlying room type is set accordingly. Defaults to `false` (audio-only).
   */
  isVideo?: boolean;
};

/**
 * Tracks the current VoIP call state (driven by {@link useVoIPEvents}) and drives
 * the Fishjam connection — joining the room on answer, leaving it on end. Exposes
 * the call state and controls through {@link useVoip}.
 *
 * Render it inside a `FishjamProvider` so it can reach the Fishjam connection.
 */
export function VoipProvider({
  getPeerToken,
  requestCall,
  isVideo = false,
  children,
}: VoipProviderProps) {
  const [voipToken, setVoipToken] = useState<string | null>(null);
  const [status, setStatus] = useState<VoipCallStatus>('available');
  const [currentCall, setCurrentCall] = useState<CurrentCall | null>(null);

  const currentCallRef = useRef<CurrentCall | null>(null);
  const { startCamera, stopCamera } = useCamera();
  const { startMicrophone, stopMicrophone } = useMicrophone();
  const { joinRoom, leaveRoom } = useConnection();
  const { startCallKitSession, endCallKitSession } = useCallKit();
  const {
    startCall: startTelecomSession,
    endCall: endTelecomSession,
    setCallActive: setTelecomCallActive,
  } = useTelecom();
  const { remotePeers } = usePeers();

  const startNativeCallSession = useCallback(
    (to: string) =>
      Platform.OS === 'ios'
        ? startCallKitSession({ displayName: to, isVideo })
        : startTelecomSession({ displayName: to, isVideo }),
    [startCallKitSession, startTelecomSession, isVideo],
  );

  const endNativeCallSession = useCallback(
    () => (Platform.OS === 'ios' ? endCallKitSession() : endTelecomSession()),
    [endCallKitSession, endTelecomSession],
  );

  const handleJoinRoom = useCallback(
    async (roomName: string) => {
      const token = await getPeerToken(roomName);
      if (isVideo) {
        await startCamera();
      }
      await startMicrophone();
      await joinRoom({ peerToken: token });
    },
    [getPeerToken, joinRoom, startMicrophone, startCamera, isVideo],
  );

  const handleLeaveRoom = useCallback(async () => {
    await stopCamera();
    await stopMicrophone();
    await leaveRoom();
  }, [leaveRoom, stopCamera, stopMicrophone]);

  const endCall = useCallback(async () => {
    await endNativeCallSession();
    await handleLeaveRoom();
    currentCallRef.current = null;
    setCurrentCall(null);
    setStatus('available');
  }, [endNativeCallSession, handleLeaveRoom]);

  const startCall = useCallback(
    async (to: string, roomName: string) => {
      const call: CurrentCall = {
        roomName,
        displayName: to,
        isVideo,
        startedAt: null,
      };
      currentCallRef.current = call;
      setCurrentCall(call);
      setStatus('connecting');

      try {
        await requestCall({ to, roomName, isVideo });
        await startNativeCallSession(to);
        await handleJoinRoom(roomName);
      } catch (err) {
        console.error('Failed to start call:', err);
        await endCall();
      }
    },
    [requestCall, handleJoinRoom, startNativeCallSession, isVideo, endCall],
  );

  const answerCall = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call) return;

    setStatus('connecting');
    try {
      await handleJoinRoom(call.roomName);
    } catch (err) {
      console.error('Failed to join room on answer:', err);
      await endCall();
    }
  }, [handleJoinRoom, endCall]);

  useVoIPEvents({
    onRegistered: useCallback((token: string) => {
      setVoipToken(token);
      console.log('onRegistered', token);
    }, []),

    onIncoming: useCallback((payload: VoipIncomingPayload) => {
      console.log('onIncoming', payload);
      const call: CurrentCall = {
        roomName: payload.roomName,
        displayName: payload.displayName,
        isVideo: payload.isVideo,
        startedAt: null,
      };
      currentCallRef.current = call;
      setCurrentCall(call);
      setStatus('incoming');
    }, []),

    onAnswered: useCallback(async () => {
      console.log('onAnswered');
      await answerCall();
    }, [answerCall]),

    onEnded: useCallback(async () => {
      console.log('onEnded');
      await endCall();
    }, [endCall]),
  });

  useEffect(() => {
    if (status === 'connecting' && remotePeers.length > 0) {
      if (currentCallRef.current) {
        const call = { ...currentCallRef.current, startedAt: Date.now() };
        currentCallRef.current = call;
        setCurrentCall(call);
      }
      setStatus('active');

      if (Platform.OS === 'android') {
        setTelecomCallActive().catch((err) =>
          console.warn('Failed to activate telecom call:', err),
        );
      }
    } else if (status === 'active' && remotePeers.length === 0) {
      endCall().catch((err) => console.error('Failed to end call:', err));
    }
  }, [remotePeers.length, status, endCall, setTelecomCallActive]);

  const voipValue = useMemo(
    () => ({
      voipToken,
      status,
      currentCall,
      startCall,
      answerCall,
      endCall,
    }),
    [voipToken, status, currentCall, startCall, answerCall, endCall],
  );

  return (
    <VoipContext.Provider value={voipValue}>{children}</VoipContext.Provider>
  );
}

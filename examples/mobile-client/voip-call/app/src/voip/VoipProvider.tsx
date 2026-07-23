import {
  type CallEndedReason,
  failIncomingCallConnected,
  fulfillIncomingCallConnected,
  reportOutgoingCallConnected,
  setCallHeld as setVoipCallHeld,
  useCallKit,
  useCamera,
  useConnection,
  useMicrophone,
  usePeers,
  useTelecom,
  useVoIPEvents,
  type VoipCallIntent,
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
   * A waiting or overflow incoming call was declined from native UI. Does not
   * change local call state - use for signaling (e.g. `call-rejected` to the caller).
   */
  onWaitingCallDeclined?: (payload: VoipIncomingPayload) => void;
  /**
   * Whether outgoing calls are video calls — reflected in the CallKit session.
   * Make sure the underlying room type is set accordingly. Defaults to `false` (audio-only).
   */
  isVideo?: boolean;
  /** Whether the app has restored enough session state to start an intent-driven outgoing call. */
  canStartOutgoingCall?: boolean;
};

function makeRoomName() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const id = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `voip-${id}`;
}

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
  onWaitingCallDeclined,
  isVideo = false,
  canStartOutgoingCall = true,
  children,
}: VoipProviderProps) {
  const [voipToken, setVoipToken] = useState<string | null>(null);
  const [status, setStatus] = useState<VoipCallStatus>('available');
  const [currentCall, setCurrentCall] = useState<CurrentCall | null>(null);
  const [lastEndedReason, setLastEndedReason] =
    useState<CallEndedReason | null>(null);
  const [isOnHold, setIsOnHold] = useState(false);

  const currentCallRef = useRef<CurrentCall | null>(null);
  const pendingAnswerRequestIdRef = useRef<string | null>(null);
  const activationInFlightRef = useRef(false);
  const isCallOnHoldRef = useRef(false);
  const heldMediaStateRef = useRef({
    microphoneEnabled: false,
    cameraEnabled: false,
  });
  const pendingCallIntentRef = useRef<VoipCallIntent | null>(null);
  /** Fishjam room the client is currently joined to, if any. */
  const connectedRoomRef = useRef<string | null>(null);
  /** Serializes native call events so End & Accept cannot interleave teardown and join. */
  const callTransitionRef = useRef(Promise.resolve());
  /**
   * Set when the accept (`onAnswered`) is processed before the promoted waiting
   * call's `onIncoming` payload, so `onIncoming` can replay the answer.
   */
  const pendingWaitingAnswerRef = useRef<string | null>(null);

  const enqueueCallTransition = useCallback((op: () => Promise<void>) => {
    const run = callTransitionRef.current.then(op);
    callTransitionRef.current = run.catch(() => {});
    return run;
  }, []);

  const { isCameraOn, startCamera, stopCamera, toggleCamera } = useCamera();
  const { isMicrophoneOn, startMicrophone, stopMicrophone, toggleMicrophone } =
    useMicrophone();
  const { joinRoom, leaveRoom } = useConnection();
  const { startCallKitSession, endCallKitSession } = useCallKit();
  const { startCall: startTelecomSession, endCall: endTelecomSession } =
    useTelecom();
  const { remotePeers } = usePeers();

  const startNativeCallSession = useCallback(
    (to: string) =>
      Platform.OS === 'ios'
        ? startCallKitSession({ displayName: to, handle: to, isVideo })
        : startTelecomSession({ displayName: to, handle: to, isVideo }),
    [startCallKitSession, startTelecomSession, isVideo],
  );

  const endNativeCallSession = useCallback(
    (reason?: CallEndedReason) =>
      Platform.OS === 'ios'
        ? endCallKitSession(reason)
        : endTelecomSession(reason),
    [endCallKitSession, endTelecomSession],
  );

  const setCallHeld = useCallback(async (onHold: boolean) => {
    if (!currentCallRef.current) {
      return;
    }
    await setVoipCallHeld(onHold);
  }, []);

  const handleJoinRoom = useCallback(
    async (roomName: string) => {
      const token = await getPeerToken(roomName);
      if (isVideo) {
        await startCamera();
      }
      await startMicrophone();
      await joinRoom({ peerToken: token });
      connectedRoomRef.current = roomName;
    },
    [getPeerToken, joinRoom, startMicrophone, startCamera, isVideo],
  );

  const handleLeaveRoom = useCallback(async () => {
    connectedRoomRef.current = null;
    await stopCamera();
    await stopMicrophone();
    await leaveRoom();
  }, [leaveRoom, stopCamera, stopMicrophone]);

  const resetCallState = useCallback(
    async (reason: CallEndedReason = 'local', endedRoomName?: string) => {
      const roomName = endedRoomName ?? currentCallRef.current?.roomName;
      if (!roomName) return;

      if (currentCallRef.current?.roomName === roomName) {
        currentCallRef.current = null;
        pendingAnswerRequestIdRef.current = null;
        pendingWaitingAnswerRef.current = null;
        isCallOnHoldRef.current = false;
        heldMediaStateRef.current = {
          microphoneEnabled: false,
          cameraEnabled: false,
        };
        setIsOnHold(false);
        setCurrentCall(null);
        setStatus('available');
        setLastEndedReason(reason);
      }

      if (connectedRoomRef.current === roomName) {
        await handleLeaveRoom();
      }
    },
    [handleLeaveRoom],
  );

  const endCall = useCallback(
    async (
      reason: CallEndedReason = 'local',
      options?: { fromNative?: boolean },
    ) => {
      const endedCall = currentCallRef.current;
      if (!endedCall) return;

      const resetPromise = resetCallState(reason, endedCall.roomName);
      try {
        // Native already ended the CallKit session before `onEnded` fired — calling
        // endNativeCallSession again during call-waiting swap would end the new call.
        if (!options?.fromNative) {
          await endNativeCallSession(reason);
        }
      } finally {
        await resetPromise;
      }
    },
    [endNativeCallSession, resetCallState],
  );

  const startCall = useCallback(
    async (to: string, roomName: string) => {
      const call: CurrentCall = {
        roomName,
        displayName: to,
        handle: to,
        isVideo,
        startedAt: null,
        isOutgoing: true,
      };
      currentCallRef.current = call;
      setCurrentCall(call);
      setStatus('connecting');
      setLastEndedReason(null);

      try {
        await requestCall({ to, roomName, isVideo });
        await startNativeCallSession(to);
        await handleJoinRoom(roomName);
      } catch (err) {
        console.error('Failed to start call:', err);
        await endCall('failed');
      }
    },
    [requestCall, handleJoinRoom, startNativeCallSession, isVideo, endCall],
  );

  const answerCall = useCallback(
    async (requestId?: string) => {
      const call = currentCallRef.current;
      if (!call) return;

      if (requestId) {
        pendingAnswerRequestIdRef.current = requestId;
      }
      setStatus('connecting');
      try {
        await handleJoinRoom(call.roomName);
      } catch (err) {
        console.error('Failed to join room on answer:', err);
        if (requestId) {
          try {
            await failIncomingCallConnected(requestId);
          } finally {
            if (pendingAnswerRequestIdRef.current === requestId) {
              pendingAnswerRequestIdRef.current = null;
            }
            await resetCallState('failed');
          }
        } else {
          await endCall('failed');
        }
      }
    },
    [handleJoinRoom, endCall, resetCallState],
  );

  const startCallFromIntent = useCallback(
    async (intent: VoipCallIntent) => {
      if (currentCallRef.current) {
        console.warn('Ignoring call intent while another call is active');
        return;
      }

      try {
        await startCall(intent.handle, makeRoomName());
      } catch (err) {
        console.error('Failed to start call from a Recents intent:', err);
      }
    },
    [startCall],
  );

  useVoIPEvents({
    onRegistered: useCallback((token: string) => {
      setVoipToken(token);
    }, []),

    // Native only delivers `onIncoming` for a *first* call, or for a waiting call
    // the moment the user picks "End & Accept" — never while a waiting call merely
    // rings (that stays entirely inside CallKit/Telecom). For an accepted waiting
    // call, native ends the old call first and buffers the new call's payload until
    // that teardown completes.
    onIncoming: useCallback(
      (payload: VoipIncomingPayload) => {
        enqueueCallTransition(async () => {
          const call: CurrentCall = {
            roomName: payload.roomName,
            displayName: payload.displayName,
            handle: payload.handle,
            isVideo: payload.isVideo,
            startedAt: null,
            isOutgoing: false,
          };
          currentCallRef.current = call;
          setCurrentCall(call);
          setStatus('incoming');
          setLastEndedReason(null);

          const pendingAnswer = pendingWaitingAnswerRef.current;
          if (pendingAnswer) {
            pendingWaitingAnswerRef.current = null;
            await answerCall(pendingAnswer);
          }
        });
      },
      [answerCall, enqueueCallTransition],
    ),

    onAnswered: useCallback(
      (requestId: string) => {
        enqueueCallTransition(async () => {
          if (pendingAnswerRequestIdRef.current) {
            return;
          }

          // No ringing call to answer yet: either the accepted waiting call's
          // `onIncoming` hasn't arrived, or `call` is still the old (already
          // `active`) call that native is ending. Stash so `onIncoming` replays it.
          const call = currentCallRef.current;
          if (!call || call.startedAt != null) {
            pendingWaitingAnswerRef.current = requestId;
            return;
          }

          await answerCall(requestId);
        });
      },
      [answerCall, enqueueCallTransition],
    ),

    onEnded: useCallback(
      (reason?: CallEndedReason) => {
        enqueueCallTransition(async () => {
          await endCall(reason ?? 'remote', { fromNative: true });
        });
      },
      [endCall, enqueueCallTransition],
    ),

    onHeldChanged: useCallback(
      async (onHold: boolean) => {
        if (!currentCallRef.current?.startedAt) {
          return;
        }

        const call = currentCallRef.current;
        if (!call || isCallOnHoldRef.current === onHold) {
          return;
        }

        isCallOnHoldRef.current = onHold;
        setIsOnHold(onHold);
        try {
          if (onHold) {
            heldMediaStateRef.current = {
              microphoneEnabled: isMicrophoneOn,
              cameraEnabled: isCameraOn,
            };
            if (isMicrophoneOn) await toggleMicrophone();
            if (isCameraOn) await toggleCamera();
          } else {
            const { microphoneEnabled, cameraEnabled } =
              heldMediaStateRef.current;
            if (microphoneEnabled) await toggleMicrophone();
            if (cameraEnabled) await toggleCamera();
          }
        } catch (err) {
          console.error('Failed to update media for held call:', err);
        }
      },
      [isCameraOn, isMicrophoneOn, toggleCamera, toggleMicrophone],
    ),

    onMuteChanged: useCallback(
      async (muted: boolean) => {
        if (!currentCallRef.current?.startedAt) {
          return;
        }
        try {
          if (muted && isMicrophoneOn) {
            await toggleMicrophone();
          } else if (!muted && !isMicrophoneOn) {
            await toggleMicrophone();
          }
        } catch (err) {
          console.error('Failed to sync mute state:', err);
        }
      },
      [isMicrophoneOn, toggleMicrophone],
    ),

    onCallIntent: useCallback(
      async (intent: VoipCallIntent) => {
        if (!canStartOutgoingCall) {
          pendingCallIntentRef.current = intent;
          return;
        }
        await startCallFromIntent(intent);
      },
      [canStartOutgoingCall, startCallFromIntent],
    ),

    onWaitingCallDeclined,
  });

  useEffect(() => {
    if (!canStartOutgoingCall || !pendingCallIntentRef.current) {
      return;
    }
    const intent = pendingCallIntentRef.current;
    pendingCallIntentRef.current = null;
    startCallFromIntent(intent);
  }, [canStartOutgoingCall, startCallFromIntent]);

  useEffect(() => {
    if (
      status === 'connecting' &&
      remotePeers.length > 0 &&
      !activationInFlightRef.current
    ) {
      activationInFlightRef.current = true;
      const activateCall = async () => {
        const requestId = pendingAnswerRequestIdRef.current;
        if (requestId) {
          pendingAnswerRequestIdRef.current = null;
          const connected = await fulfillIncomingCallConnected(requestId);
          if (!connected) {
            await endCall('failed');
            return;
          }
        } else if (currentCallRef.current?.isOutgoing) {
          await reportOutgoingCallConnected();
        }

        const currentCall = currentCallRef.current;
        if (!currentCall) return;
        const call = { ...currentCall, startedAt: Date.now() };
        currentCallRef.current = call;
        setCurrentCall(call);
        setStatus('active');
      };
      activateCall()
        .catch((err) => {
          console.error('Failed to activate call:', err);
          endCall('failed').catch((endError) =>
            console.error(
              'Failed to end call after activation error:',
              endError,
            ),
          );
        })
        .finally(() => {
          activationInFlightRef.current = false;
        });
    } else if (status === 'active' && remotePeers.length === 0) {
      endCall('remote').catch((err) =>
        console.error('Failed to end call:', err),
      );
    }
  }, [remotePeers.length, status, endCall]);

  const voipValue = useMemo(
    () => ({
      voipToken,
      status,
      currentCall,
      lastEndedReason,
      isOnHold,
      startCall,
      answerCall,
      endCall,
      setCallHeld,
    }),
    [
      voipToken,
      status,
      currentCall,
      lastEndedReason,
      isOnHold,
      startCall,
      answerCall,
      endCall,
      setCallHeld,
    ],
  );

  return (
    <VoipContext.Provider value={voipValue}>{children}</VoipContext.Provider>
  );
}

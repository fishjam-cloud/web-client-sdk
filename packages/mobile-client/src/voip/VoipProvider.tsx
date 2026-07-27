import {
  type CallEndedReason,
  failIncomingCallConnected,
  fulfillIncomingCallConnected,
  reportOutgoingCallConnected,
  setCallHeld as setVoipCallHeld,
  useTelecom,
  useVoIPEvents,
  type VoipCallIntent,
  type VoipIncomingPayload,
} from '@fishjam-cloud/react-native-webrtc';
import { type PropsWithChildren, useCallback, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useCallKit } from '../overrides/hooks';
import { type CurrentCall, type VoipCallStatus, VoipContext } from './VoipContext';

/**
 * Props of {@link VoipProvider} — the configuration of the VoIP call machine.
 */
export type VoipProviderProps = PropsWithChildren & {
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
};

/**
 * Tracks the current VoIP call state, driven by the native CallKit / Core-Telecom
 * events from {@link useVoIPEvents}, and exposes it through {@link useVoip}.
 *
 * Joining rooms, peer tokens and media are the consumer's — react to `status` and
 * report back with `reportConnected` / `reportConnectFailed`.
 */
export function VoipProvider({ onWaitingCallDeclined, isVideo = false, children }: VoipProviderProps) {
  const [voipToken, setVoipToken] = useState<string | null>(null);
  const [status, setStatus] = useState<VoipCallStatus>('available');
  const [currentCall, setCurrentCall] = useState<CurrentCall | null>(null);
  const [lastEndedReason, setLastEndedReason] = useState<CallEndedReason | null>(null);
  const [isOnHold, setIsOnHold] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [pendingCallIntent, setPendingCallIntent] = useState<VoipCallIntent | null>(null);

  const currentCallRef = useRef<CurrentCall | null>(null);
  const pendingAnswerRequestIdRef = useRef<string | null>(null);
  const activationInFlightRef = useRef(false);
  const isCallOnHoldRef = useRef(false);
  /** Serializes native call events so End & Accept cannot interleave their transitions. */
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

  const { startCallKitSession, endCallKitSession } = useCallKit();
  const { startCall: startTelecomSession, endCall: endTelecomSession } = useTelecom();

  const startNativeCallSession = useCallback(
    (to: string) =>
      Platform.OS === 'ios'
        ? startCallKitSession({ displayName: to, handle: to, isVideo })
        : startTelecomSession({ displayName: to, handle: to, isVideo }),
    [startCallKitSession, startTelecomSession, isVideo],
  );

  const endNativeCallSession = useCallback(
    (reason?: CallEndedReason) => (Platform.OS === 'ios' ? endCallKitSession(reason) : endTelecomSession(reason)),
    [endCallKitSession, endTelecomSession],
  );

  const setCallHeld = useCallback(async (onHold: boolean) => {
    if (!currentCallRef.current) {
      return;
    }
    await setVoipCallHeld(onHold);
  }, []);

  const resetCallState = useCallback((reason: CallEndedReason = 'local', endedRoomName?: string) => {
    const roomName = endedRoomName ?? currentCallRef.current?.roomName;
    if (!roomName || currentCallRef.current?.roomName !== roomName) {
      return;
    }

    currentCallRef.current = null;
    pendingAnswerRequestIdRef.current = null;
    pendingWaitingAnswerRef.current = null;
    isCallOnHoldRef.current = false;
    setIsOnHold(false);
    setIsMuted(false);
    setCurrentCall(null);
    setStatus('available');
    setLastEndedReason(reason);
  }, []);

  const endCall = useCallback(
    async (reason: CallEndedReason = 'local', options?: { fromNative?: boolean }) => {
      const endedCall = currentCallRef.current;
      if (!endedCall) return;

      resetCallState(reason, endedCall.roomName);

      // Native already ended the CallKit session before `onEnded` fired — calling
      // endNativeCallSession again during call-waiting swap would end the new call.
      if (!options?.fromNative) {
        await endNativeCallSession(reason);
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
        await startNativeCallSession(to);
      } catch (err) {
        console.error('Failed to start call:', err);
        await endCall('failed');
      }
    },
    [startNativeCallSession, isVideo, endCall],
  );

  const reportConnected = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call || call.startedAt != null || activationInFlightRef.current) {
      return;
    }
    activationInFlightRef.current = true;

    try {
      const requestId = pendingAnswerRequestIdRef.current;
      if (requestId) {
        pendingAnswerRequestIdRef.current = null;
        const connected = await fulfillIncomingCallConnected(requestId);
        if (!connected) {
          await endCall('failed');
          return;
        }
      } else if (call.isOutgoing) {
        await reportOutgoingCallConnected();
      }

      // The call may have ended while we were talking to the native side.
      const activeCall = currentCallRef.current;
      if (!activeCall || activeCall.roomName !== call.roomName) return;

      const connectedCall = { ...activeCall, startedAt: Date.now() };
      currentCallRef.current = connectedCall;
      setCurrentCall(connectedCall);
      setStatus('active');
    } catch (err) {
      console.error('Failed to activate call:', err);
      await endCall('failed');
    } finally {
      activationInFlightRef.current = false;
    }
  }, [endCall]);

  const reportConnectFailed = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call) return;

    const requestId = pendingAnswerRequestIdRef.current;
    if (!requestId) {
      await endCall('failed');
      return;
    }

    pendingAnswerRequestIdRef.current = null;
    try {
      await failIncomingCallConnected(requestId);
    } finally {
      resetCallState('failed', call.roomName);
    }
  }, [endCall, resetCallState]);

  const clearCallIntent = useCallback(() => setPendingCallIntent(null), []);

  useVoIPEvents({
    onRegistered: useCallback((token: string) => {
      setVoipToken(token);
    }, []),

    // Native only delivers `onIncoming` for a *first* call, or for a waiting call
    // the moment the user picks "End & Accept" — never while a waiting call merely
    // rings (that stays entirely inside CallKit/Telecom). So a payload arriving
    // while we're already in a call means an accepted waiting call is taking over:
    // native has already ended the old one, and we just swap `currentCall` over.
    // Leaving the old room and joining the new one falls out of the consumer
    // reacting to `currentCall.roomName` changing.
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
          pendingAnswerRequestIdRef.current = null;
          isCallOnHoldRef.current = false;
          setCurrentCall(call);
          setStatus('incoming');
          setLastEndedReason(null);
          setIsOnHold(false);
          setIsMuted(false);

          // The user already accepted this call before its payload arrived — apply
          // the answer we stashed then.
          const pendingAnswer = pendingWaitingAnswerRef.current;
          if (pendingAnswer) {
            pendingWaitingAnswerRef.current = null;
            pendingAnswerRequestIdRef.current = pendingAnswer;
            setStatus('connecting');
          }
        });
      },
      [enqueueCallTransition],
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

          pendingAnswerRequestIdRef.current = requestId;
          setStatus('connecting');
        });
      },
      [enqueueCallTransition],
    ),

    onEnded: useCallback(
      (reason?: CallEndedReason) => {
        enqueueCallTransition(async () => {
          await endCall(reason ?? 'remote', { fromNative: true });
        });
      },
      [endCall, enqueueCallTransition],
    ),

    onHeldChanged: useCallback((onHold: boolean) => {
      if (!currentCallRef.current?.startedAt || isCallOnHoldRef.current === onHold) {
        return;
      }
      isCallOnHoldRef.current = onHold;
      setIsOnHold(onHold);
    }, []),

    onMuteChanged: useCallback((muted: boolean) => {
      if (!currentCallRef.current?.startedAt) {
        return;
      }
      setIsMuted(muted);
    }, []),

    onCallIntent: useCallback((intent: VoipCallIntent) => {
      if (currentCallRef.current) {
        console.warn('Ignoring call intent while another call is active');
        return;
      }
      setPendingCallIntent(intent);
    }, []),

    onWaitingCallDeclined,
  });

  const voipValue = useMemo(
    () => ({
      voipToken,
      status,
      currentCall,
      lastEndedReason,
      isOnHold,
      isMuted,
      pendingCallIntent,
      clearCallIntent,
      startCall,
      reportConnected,
      reportConnectFailed,
      endCall,
      setCallHeld,
    }),
    [
      voipToken,
      status,
      currentCall,
      lastEndedReason,
      isOnHold,
      isMuted,
      pendingCallIntent,
      clearCallIntent,
      startCall,
      reportConnected,
      reportConnectFailed,
      endCall,
      setCallHeld,
    ],
  );

  return <VoipContext.Provider value={voipValue}>{children}</VoipContext.Provider>;
}

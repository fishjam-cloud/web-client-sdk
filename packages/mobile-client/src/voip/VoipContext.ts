import type { CallEndedReason, VoipCallIntent } from '@fishjam-cloud/react-native-webrtc';
import { createContext, useContext } from 'react';

/**
 * Lifecycle state of the current VoIP call.
 *
 * - `available` — no call in progress
 * - `incoming` — a call is ringing, awaiting the user's answer
 * - `connecting` — the call was started/answered; **your app should be joining its room now**
 * - `active` — your app reported the media connected and the call is in progress
 */
export type VoipCallStatus = 'available' | 'incoming' | 'connecting' | 'active';

/**
 * Details of the call currently being handled.
 */
export type CurrentCall = {
  /**
   * Fishjam room the call takes place in. For outgoing calls it is the name passed to
   * `startCall`; for incoming ones it comes from the VoIP push payload.
   */
  roomName: string;
  /** Name shown in the CallKit UI (the remote party). */
  displayName: string;
  /**
   * Stable id of the remote party — use a durable user id, not a display name (which
   * may not be unique), since this is what Recents hands back for redialing.
   */
  handle: string;
  /** Whether the call is a video call. */
  isVideo: boolean;
  /** Timestamp (ms) when the call became `active`, or `null` if not yet connected. */
  startedAt: number | null;
  /** `true` when this device initiated the call, `false` when receiving it. */
  isOutgoing: boolean;
};

/**
 * Value held by {@link VoipContext} and returned from {@link useVoip}.
 */
export type VoipContextValue = {
  /** Current call lifecycle status. */
  status: VoipCallStatus;
  /** This device's VoIP push token, or `null` until APNs has issued one. */
  voipToken: string | null;
  /** The call currently being handled, or `null` when `status` is `available`. */
  currentCall: CurrentCall | null;
  /**
   * Why the most recently handled call ended. `null` until a call has ended at
   * least once. Surfaced so a consumer can react to `missed`/`rejected`/etc., e.g.
   * showing a "missed call" notification.
   */
  lastEndedReason: CallEndedReason | null;
  /**
   * Whether the native CallKit/Core-Telecom session is currently held. Reported only —
   * apply it to your own tracks.
   */
  isOnHold: boolean;
  /** Whether the system call UI has the call muted. Reported only, as with {@link VoipContextValue.isOnHold}. */
  isMuted: boolean;
  /**
   * A redial requested from the iOS **Recents** list, or `null` when there is none.
   * It carries only the handle to call, never a room, so mint a room name yourself.
   * Held until {@link VoipContextValue.clearCallIntent}, so one arriving before your
   * app has restored its session is not lost.
   */
  pendingCallIntent: VoipCallIntent | null;
  /** Discards {@link VoipContextValue.pendingCallIntent} once you have acted on it. */
  clearCallIntent: () => void;
  /**
   * Reports an outgoing call to `to` in `roomName` to CallKit/Core-Telecom and moves
   * to `connecting`. Run your own signaling (ringing the callee) *before* calling this.
   * It does **not** join the room — react to `status` becoming `connecting` for that.
   */
  startCall: (to: string, roomName: string) => Promise<void>;
  /**
   * Report that the room join succeeded and media is flowing. Fulfills CallKit's answer
   * action (or reports the outgoing call as connected) and moves the call to `active`.
   *
   * An answered incoming call must be fulfilled within `VoipFulfillAnswerTimeout`
   * (10s by default) or the native side ends it and `onEnded` fires.
   */
  reportConnected: () => Promise<void>;
  /** Tell the SDK your room join failed. Ends the call with reason `failed`. */
  reportConnectFailed: () => Promise<void>;
  /**
   * Ends or rejects the current call. Dismisses CallKit/Telecom and resets state back
   * to `available`; leaving the room is up to you. `reason` (defaults to `local`) is
   * surfaced to the system call UI/log and to `lastEndedReason`.
   */
  endCall: (reason?: CallEndedReason) => Promise<void>;
  /** Requests that the native CallKit/Core-Telecom session be held or resumed. */
  setCallHeld: (onHold: boolean) => Promise<void>;
};

export const VoipContext = createContext<VoipContextValue | null>(null);

/**
 * Returns the current {@link VoipContextValue}.
 *
 * Must be used inside a `VoipProvider`. Without it the VoIP call machine is not
 * mounted and this hook throws.
 */
export function useVoip(): VoipContextValue {
  const ctx = useContext(VoipContext);
  if (!ctx) {
    throw new Error(
      'useVoip must be used inside a VoipProvider — wrap your app in `<VoipProvider>` to enable VoIP calls.',
    );
  }
  return ctx;
}

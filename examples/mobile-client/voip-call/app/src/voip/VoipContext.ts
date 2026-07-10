import type { CallEndedReason } from '@fishjam-cloud/react-native-client';
import { createContext, useContext } from 'react';

/**
 * Lifecycle state of the current VoIP call.
 *
 * - `available` — no call in progress
 * - `incoming` — a call is ringing, awaiting the user's answer
 * - `connecting` — the call was started/answered and we're joining the room
 * - `active` — media is connected and the call is in progress
 */
export type VoipCallStatus = 'available' | 'incoming' | 'connecting' | 'active';

/**
 * Details of the call currently being handled.
 */
export type CurrentCall = {
  /** Fishjam room the call takes place in. */
  roomName: string;
  /** Name shown in the CallKit UI (the remote party). */
  displayName: string;
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
   * Starts an outgoing call to `to` in the given `roomName` — reports it to
   * CallKit and joins the room.
   */
  startCall: (to: string, roomName: string) => Promise<void>;
  /** Answers the current incoming call and joins its room. */
  answerCall: () => Promise<void>;
  /**
   * Ends or rejects the current call. Dismisses CallKit/Telecom, leaves the
   * room, and resets state back to `available`. `reason` (defaults to `local`)
   * is surfaced to the system call UI/log and to `lastEndedReason`.
   */
  endCall: (reason?: CallEndedReason) => Promise<void>;
};

export const VoipContext = createContext<VoipContextValue | null>(null);

/**
 * Returns the current {@link VoipContextValue}.
 * Must be used within a {@link VoipProvider}.
 */
export function useVoip(): VoipContextValue {
  const ctx = useContext(VoipContext);
  if (!ctx) throw new Error('useVoip must be used within VoipProvider');
  return ctx;
}

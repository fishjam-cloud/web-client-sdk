import { createContext, useContext } from 'react';

export type VoipCallStatus = 'available' | 'incoming' | 'connecting' | 'active';

export type CurrentCall = {
  roomName: string;
  direction: 'incoming' | 'outgoing';
  remoteName: string; // counterpart name for ringing/connecting UI
  startedAt: number | null; // Date.now() when the call became active; null until then
};

export type VoipContextValue = {
  status: VoipCallStatus;
  voipToken: string | null;
  currentCall: CurrentCall | null;
  startCall: (to: string, roomName: string) => Promise<void>;
  answerCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
};

export const VoipContext = createContext<VoipContextValue | null>(null);

export function useVoip(): VoipContextValue {
  const ctx = useContext(VoipContext);
  if (!ctx) throw new Error('useVoip must be used within VoipProvider');
  return ctx;
}

import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

import {
  useVoip,
  type CurrentCall,
  type VoipCallStatus,
} from '@fishjam-cloud/react-native-client';

type Params = {
  serverUrl: string;
  username: string | null;
  /** Filled by this hook so the parent can wire {@link VoipProvider.onWaitingCallDeclined}. */
  sendSignalRef: MutableRefObject<
    ((msg: Record<string, unknown>) => void) | undefined
  >;
};

export function useCallSignaling({
  serverUrl,
  username,
  sendSignalRef,
}: Params): void {
  const { endCall, currentCall, status } = useVoip();

  const socketRef = useRef<WebSocket | null>(null);

  const handlersRef = useRef({ endCall, currentCall });
  handlersRef.current = { endCall, currentCall };

  const sendSignal = useCallback((msg: Record<string, unknown>) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      console.warn('[signaling] message not sent — socket not open', msg);
    }
  }, []);

  useEffect(() => {
    sendSignalRef.current = sendSignal;
  }, [sendSignal, sendSignalRef]);

  useEffect(() => {
    if (!username) return;

    const wsUrl =
      serverUrl.replace(/^http/, 'ws') +
      '/ws?username=' +
      encodeURIComponent(username);

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onmessage = (e) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      const { endCall, currentCall } = handlersRef.current;
      if (!currentCall || currentCall.startedAt !== null) return;
      if (currentCall.roomName !== msg.roomName) return;

      // The caller cancelled while we (the callee) are still ringing — from
      // our side this incoming call rang and was never answered.
      if (msg.type === 'call-cancelled' && !currentCall.isOutgoing) {
        void endCall('missed');
      }
      // The callee rejected while we (the caller) are still ringing out — the
      // other party ended it, not us.
      else if (msg.type === 'call-rejected' && currentCall.isOutgoing) {
        void endCall('remote');
      }
    };

    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [serverUrl, username]);

  // Detect the local user ending a call before it connected, and notify the
  // other party so their ringing UI can be dismissed.

  const prevRef = useRef<{ status: VoipCallStatus; call: CurrentCall | null }>({
    status,
    call: currentCall,
  });

  useEffect(() => {
    const { status: prevStatus, call: prevCall } = prevRef.current;

    if (prevCall && prevCall.startedAt === null && status === 'available') {
      // Caller cancelled an outgoing call that was still ringing.
      if (prevStatus === 'connecting' && prevCall.isOutgoing) {
        sendSignal({
          type: 'call-cancelled',
          to: prevCall.handle,
          roomName: prevCall.roomName,
        });
      }
      // Callee rejected an incoming call before answering.
      else if (prevStatus === 'incoming' && !prevCall.isOutgoing) {
        sendSignal({
          type: 'call-rejected',
          to: prevCall.handle,
          roomName: prevCall.roomName,
        });
      }
    }

    prevRef.current = { status, call: currentCall };
  }, [status, currentCall, sendSignal]);
}

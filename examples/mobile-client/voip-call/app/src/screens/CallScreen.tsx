import { usePeers, useVoip } from '@fishjam-cloud/react-native-client';
import { useEffect } from 'react';

import { useCallRoom } from '../hooks/useCallRoom';
import { InCallView } from './InCallView';
import { OutgoingCallView } from './OutgoingCallView';

/**
 * The screen shown for the whole lifetime of a call (`status` is `connecting` or
 * `active`). It owns the Fishjam side of the call: mounting joins the current call's
 * room via `useCallRoom`, unmounting leaves it, and the remote peer's presence is
 * reported back to the call as connect / hang-up.
 */
export function CallScreen() {
  const { status, currentCall, reportConnected, endCall } = useVoip();
  const { remotePeers } = usePeers();

  const joinedRoom = useCallRoom();

  // The remote peer showing up is what "connected" means for us, and it going away is
  // the remote hanging up. Gated on `joinedRoom` so a stale peer list from the room we
  // just left cannot connect (or end) the room we are moving into.
  useEffect(() => {
    if (!currentCall || joinedRoom !== currentCall.roomName) return;

    if (status === 'connecting' && remotePeers.length > 0) {
      void reportConnected();
    } else if (status === 'active' && remotePeers.length === 0) {
      void endCall('remote');
    }
  }, [
    status,
    currentCall,
    joinedRoom,
    remotePeers.length,
    reportConnected,
    endCall,
  ]);

  if (status === 'active') {
    return <InCallView />;
  }
  return <OutgoingCallView />;
}

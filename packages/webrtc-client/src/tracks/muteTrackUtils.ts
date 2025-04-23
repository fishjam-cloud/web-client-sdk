import { MediaEvent_UnmuteTrack } from '@fishjam-cloud/protobufs/peer';

import { serializePeerMediaEvent } from '../mediaEvent';
import type { WebRTCEndpoint } from '../webRTCEndpoint';

export function emitMutableEvents(action: 'mute' | 'unmute', webrtc: WebRTCEndpoint, trackId: string) {
  const localEventType = action === 'mute' ? 'localTrackMuted' : 'localTrackUnmuted';

  // Sending the media event `unmuteTrack` speeds up the unmuting of this track for other users
  // Without this media event, the track may take up to 5-10 seconds to unmute
  if (action == 'unmute') {
    const unmuteTrack = MediaEvent_UnmuteTrack.create({ trackId });
    webrtc.emit('sendMediaEvent', serializePeerMediaEvent({ unmuteTrack }));
  }

  webrtc.emit(localEventType, { trackId });
}

export function getActionType(
  currentTrack: MediaStreamTrack | null,
  newTrack: MediaStreamTrack | null,
): 'mute' | 'unmute' | 'replace' {
  if (currentTrack && !newTrack) {
    return 'mute';
  } else if (!currentTrack && newTrack) {
    return 'unmute';
  } else {
    return 'replace';
  }
}

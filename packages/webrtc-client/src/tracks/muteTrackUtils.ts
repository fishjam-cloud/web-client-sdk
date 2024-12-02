import type { WebRTCEndpoint } from '../webRTCEndpoint';

export function emitMutableEvents(action: 'mute' | 'unmute', webrtc: WebRTCEndpoint, trackId: string) {
  const localEventType = action === 'mute' ? 'localTrackMuted' : 'localTrackUnmuted';

  // TODO add the mute/unmute event back if they're needed
  // const mediaEvent = generateMediaEvent(mediaEventType, { trackId: trackId });
  // webrtc.sendMediaEvent(mediaEvent);

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

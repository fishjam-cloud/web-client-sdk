import type { WebRTCEndpoint } from '../webRTCEndpoint';
import { generateMediaEvent } from '../mediaEvent';

export function emitMutableEvents<EndpointMetadata, TrackMetadata>(
  action: 'mute' | 'unmute',
  webrtc: WebRTCEndpoint<EndpointMetadata, TrackMetadata>,
  trackId: string,
) {
  const mediaEventType = action === 'mute' ? `muteTrack` : `unmuteTrack`;
  const localEventType = action === 'mute' ? `localTrackMuted` : `localTrackUnmuted`;

  const mediaEvent = generateMediaEvent(mediaEventType, { trackId: trackId });
  webrtc.sendMediaEvent(mediaEvent);

  webrtc.emit(localEventType, { trackId: trackId });
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

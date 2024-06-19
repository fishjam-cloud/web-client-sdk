import { MediaEvent } from './mediaEvent';
import { TrackContextImpl } from './internal';
import { VadStatus } from './types';

const vadStatuses = ['speech', 'silence'] as const;

const isVadStatus = (status: string): status is VadStatus => {
  return vadStatuses.includes(status as VadStatus);
};

export const handleVoiceActivationDetectionNotification = <
  EndpointMetadata,
  TrackMetadata,
>(
  deserializedMediaEvent: MediaEvent,
  trackIdToTrack: Map<
    string,
    TrackContextImpl<EndpointMetadata, TrackMetadata>
  >,
) => {
  const trackId = deserializedMediaEvent.data.trackId;
  const ctx = trackIdToTrack.get(trackId)!;
  const vadStatus = deserializedMediaEvent.data.status;
  if (isVadStatus(vadStatus)) {
    ctx.vadStatus = vadStatus;
    ctx.emit('voiceActivityChanged', ctx);
  } else {
    console.warn('Received unknown vad status: ', vadStatus);
  }
};

import { generateCustomEvent } from './mediaEvent';
import { getTrackIdToTrackBitrates } from './bitrate';
import { getMidToTrackId } from './transciever';
import type { RemoteTrackId, TrackContext } from './types';
import type { EndpointWithTrackContext, TrackContextImpl } from './internal';

export const createSdpOfferEvent = <EndpointMetadata, TrackMetadata>(
  offer: RTCSessionDescriptionInit,
  connection: RTCPeerConnection | undefined,
  localTrackIdToTrack: Map<
    RemoteTrackId,
    TrackContextImpl<EndpointMetadata, TrackMetadata>
  >,
  localEndpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata>,
  midToTrackId: Map<string, string>,
) =>
  generateCustomEvent({
    type: 'sdpOffer',
    data: {
      sdpOffer: offer,
      trackIdToTrackMetadata: getTrackIdToMetadata(localEndpoint.tracks),
      trackIdToTrackBitrates: getTrackIdToTrackBitrates(
        connection,
        localTrackIdToTrack,
        localEndpoint.tracks,
      ),
      midToTrackId: getMidToTrackId(
        connection,
        localTrackIdToTrack,
        midToTrackId,
        localEndpoint,
      ),
    },
  });

const getTrackIdToMetadata = <EndpointMetadata, TrackMetadata>(
  tracks: Map<string, TrackContext<EndpointMetadata, TrackMetadata>>,
): Record<string, TrackMetadata | undefined> =>
  Array.from(tracks.entries()).reduce(
    (previousValue, [trackId, { metadata }]) => ({
      ...previousValue,
      [trackId]: metadata,
    }),
    {} as Record<string, TrackMetadata | undefined>,
  );

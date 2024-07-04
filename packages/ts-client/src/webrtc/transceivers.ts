import type { EndpointWithTrackContext, TrackContextImpl } from './internal';
import type { RemoteTrackId } from './types';

type Mid = string;
type TrackId = string;
type MidToTrackId = Record<Mid, TrackId>;

export const getMidToTrackId = <EndpointMetadata, TrackMetadata>(
  connection: RTCPeerConnection | undefined,
  localTrackIdToTrack: Map<
    RemoteTrackId,
    TrackContextImpl<EndpointMetadata, TrackMetadata>
  >,
  midToTrackId: Map<string, string> = new Map(),
  localEndpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata>,
): MidToTrackId | null => {
  if (!connection) return null;

  // - negotiated unmuted tracks: tracks added in previous negotiation, data is being transmitted
  // - not yet negotiated tracks: tracks added in this negotiation, data will be transmitted after successful negotiation
  const mappingFromTransceivers = getTransceiverMapping(
    connection,
    localTrackIdToTrack,
  );

  // - negotiated unmuted tracks: tracks added in previous negotiation, data is being transmitted
  // - negotiated muted tracks: tracks added in previous negotiation, data is not being transmitted but can be transmitted in the future
  const mappingFromLocalNegotiatedTracks = getAllNegotiatedLocalTracksMapping(
    midToTrackId,
    localEndpoint,
  );

  return { ...mappingFromTransceivers, ...mappingFromLocalNegotiatedTracks };
};

const getTrackContext = <EndpointMetadata, TrackMetadata>(
  localTrackIdToTrack: Map<
    RemoteTrackId,
    TrackContextImpl<EndpointMetadata, TrackMetadata>
  >,
  localTrackId: string,
) =>
  Array.from(localTrackIdToTrack.values()).find(
    (trackContext) => trackContext?.track?.id === localTrackId,
  )!;

const getTransceiverMapping = <EndpointMetadata, TrackMetadata>(
  connection: RTCPeerConnection,
  localTrackIdToTrack: Map<
    RemoteTrackId,
    TrackContextImpl<EndpointMetadata, TrackMetadata>
  >,
): MidToTrackId =>
  connection
    .getTransceivers()
    .filter((transceiver) => transceiver.sender.track?.id && transceiver.mid)
    .reduce(
      (acc, transceiver) => {
        const localTrackId = transceiver.sender.track!.id;
        const mid = transceiver!.mid!;

        const trackContext = getTrackContext(localTrackIdToTrack, localTrackId);

        acc[mid] = trackContext.trackId;

        return acc;
      },
      {} as Record<Mid, TrackId>,
    );

const getAllNegotiatedLocalTracksMapping = <EndpointMetadata, TrackMetadata>(
  midToTrackId: Map<string, string> = new Map(),
  localEndpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata>,
): MidToTrackId => {
  return [...midToTrackId.entries()]
    .filter(([_mid, trackId]) => localEndpoint.tracks.get(trackId))
    .reduce(
      (acc, [mid, trackId]) => {
        acc[mid] = trackId;

        return acc;
      },
      {} as Record<Mid, TrackId>,
    );
};

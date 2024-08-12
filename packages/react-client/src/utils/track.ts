import type { FishjamClient, TrackContext } from "@fishjam-cloud/ts-client";
import type { Track } from "../state.types";

// In most cases, the track is identified by its remote track ID.
// This ID comes from the ts-client `addTrack` method.
// However, we don't have that ID before the `addTrack` method returns it.
//
// The `addTrack` method emits the `localTrackAdded` event.
// This event will refresh the internal state of this object.
// However, in that event handler, we don't yet have the remote track ID.
// Therefore, for that brief moment, we will use the local track ID from the MediaStreamTrack object to identify the track.
const getRemoteOrLocalTrackContext = <PeerMetadata, TrackMetadata>(
  tsClient: FishjamClient<PeerMetadata, TrackMetadata>,
  remoteOrLocalTrackId: string | null,
): TrackContext<PeerMetadata, TrackMetadata> | null => {
  if (!remoteOrLocalTrackId) return null;

  const tracks = tsClient?.getLocalPeer()?.tracks;
  if (!tracks) return null;

  const trackByRemoteId = tracks?.get(remoteOrLocalTrackId);
  if (trackByRemoteId) return trackByRemoteId;

  const trackByLocalId = [...tracks.values()].find((track) => track.track?.id === remoteOrLocalTrackId);
  return trackByLocalId ? trackByLocalId : null;
};

const getTrackFromContext = <TrackMetadata>(context: TrackContext<unknown, TrackMetadata>): Track<TrackMetadata> => ({
  rawMetadata: context.rawMetadata,
  metadata: context.metadata,
  trackId: context.trackId,
  stream: context.stream,
  simulcastConfig: context.simulcastConfig || null,
  encoding: context.encoding || null,
  vadStatus: context.vadStatus,
  track: context.track,
  metadataParsingError: context.metadataParsingError,
});

export const getRemoteOrLocalTrack = <PeerMetadata, TrackMetadata>(
  tsClient: FishjamClient<PeerMetadata, TrackMetadata>,
  remoteOrLocalTrackId: string | null,
) => {
  const context = getRemoteOrLocalTrackContext(tsClient, remoteOrLocalTrackId);
  if (!context) return null;
  return getTrackFromContext<TrackMetadata>(context);
};

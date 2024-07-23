import { FishjamClient, TrackContext } from "@fishjam-dev/ts-client";
import { Track } from "../state.types";

export const getRemoteTrackContext = <PeerMetadata, TrackMetadata>(
  tsClient: FishjamClient<PeerMetadata, TrackMetadata>,
  remoteOrLocalTrackId: string | null,
): TrackContext<PeerMetadata, TrackMetadata> | null => {
  if (!remoteOrLocalTrackId) return null;

  const tracks = tsClient?.getLocalEndpoint()?.tracks;
  if (!tracks) return null;

  const trackByRemoteId = tracks?.get(remoteOrLocalTrackId);
  if (trackByRemoteId) return trackByRemoteId;

  const trackByLocalId = [...tracks.values()].find((track) => track.track?.id === remoteOrLocalTrackId);
  return trackByLocalId ? trackByLocalId : null;
};

export const getTrackFromContext = <TrackMetadata>(
  track: TrackContext<unknown, TrackMetadata>,
): Track<TrackMetadata> => ({
  rawMetadata: track.rawMetadata,
  metadata: track.metadata,
  trackId: track.trackId,
  stream: track.stream,
  simulcastConfig: track.simulcastConfig || null,
  encoding: track.encoding || null,
  vadStatus: track.vadStatus,
  track: track.track,
  metadataParsingError: track.metadataParsingError,
});

export const getRemoteTrack = <PeerMetadata, TrackMetadata>(
  tsClient: FishjamClient<PeerMetadata, TrackMetadata>,
  remoteOrLocalTrackId: string | null,
) => {
  const context = getRemoteTrackContext(tsClient, remoteOrLocalTrackId);
  if (!context) return null;
  return getTrackFromContext(context);
};

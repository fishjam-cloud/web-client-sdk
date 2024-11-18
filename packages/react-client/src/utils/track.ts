import type { Encoding, FishjamClient, TrackContext, TrackMetadata } from "@fishjam-cloud/ts-client";
import type { BandwidthLimits, Track } from "../types/public";

// In most cases, the track is identified by its remote track ID.
// This ID comes from the ts-client `addTrack` method.
// However, we don't have that ID before the `addTrack` method returns it.
//
// The `addTrack` method emits the `localTrackAdded` event.
// This event will refresh the internal state of this object.
// However, in that event handler, we don't yet have the remote track ID.
// Therefore, for that brief moment, we will use the local track ID from the MediaStreamTrack object to identify the track.
const getRemoteOrLocalTrackContext = <PeerMetadata>(
  tsClient: FishjamClient<PeerMetadata>,
  remoteOrLocalTrackId: string | null,
): TrackContext | null => {
  if (!remoteOrLocalTrackId) return null;

  const tracks = tsClient?.getLocalPeer()?.tracks;
  if (!tracks) return null;

  const trackByRemoteId = tracks?.get(remoteOrLocalTrackId);
  if (trackByRemoteId) return trackByRemoteId;

  const trackByLocalId = [...tracks.values()].find((track) => track.track?.id === remoteOrLocalTrackId);
  return trackByLocalId ? trackByLocalId : null;
};

const getTrackFromContext = (context: TrackContext): Track => ({
  metadata: context.metadata as TrackMetadata,
  trackId: context.trackId,
  stream: context.stream,
  simulcastConfig: context.simulcastConfig || null,
  encoding: context.encoding || null,
  vadStatus: context.vadStatus,
  track: context.track,
});

export const getRemoteOrLocalTrack = (tsClient: FishjamClient, remoteOrLocalTrackId: string | null) => {
  const context = getRemoteOrLocalTrackContext(tsClient, remoteOrLocalTrackId);
  if (!context) return null;
  return getTrackFromContext(context);
};

export function setupOnEndedCallback(
  track: MediaStreamTrack,
  getCurrentTrackId: () => string | undefined,
  callback: () => Promise<void>,
) {
  track.addEventListener("ended", async (event: Event) => {
    const trackId = (event.target as MediaStreamTrack).id;
    if (trackId === getCurrentTrackId()) {
      await callback();
    }
  });
}

const getDisabledEncodings = (activeEncodings: Encoding[] = []) => {
  const allEncodings: Encoding[] = ["l", "m", "h"];
  return allEncodings.filter((encoding) => !activeEncodings.includes(encoding));
};

export const getConfigAndBandwidthFromProps = (
  encodings: Encoding[] | false | undefined,
  bandwidthLimits: BandwidthLimits,
) => {
  if (!encodings) return [bandwidthLimits.singleStream, undefined] as const;

  const config = {
    enabled: true,
    activeEncodings: encodings,
    disabledEncodings: getDisabledEncodings(encodings),
  };
  const bandwidth = new Map<Encoding, number>(Object.entries(bandwidthLimits.simulcast) as [Encoding, number][]);
  return [bandwidth, config] as const;
};

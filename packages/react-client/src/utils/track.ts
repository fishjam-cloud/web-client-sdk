import type { FishjamClient, SimulcastConfig, TrackContext, TrackMetadata } from "@fishjam-cloud/ts-client";
import { Variant } from "@fishjam-cloud/ts-client";

import type { BandwidthLimits, Track, TrackId } from "../types/public";

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
  remoteOrLocalTrackId: string,
): TrackContext | null => {
  const tracks = tsClient?.getLocalPeer()?.tracks;
  if (!tracks) return null;

  const trackByRemoteId = tracks?.get(remoteOrLocalTrackId);
  if (trackByRemoteId) return trackByRemoteId;

  const trackByLocalId = [...tracks.values()].find(({ track }) => track?.id === remoteOrLocalTrackId);
  return trackByLocalId ?? null;
};

const getTrackFromContext = (context: TrackContext): Track => ({
  metadata: context.metadata as TrackMetadata,
  trackId: context.trackId as TrackId,
  stream: context.stream,
  simulcastConfig: context.simulcastConfig || null,
  encoding: context.encoding || null,
  track: context.track,
});

export const getRemoteOrLocalTrack = (tsClient: FishjamClient, remoteOrLocalTrackId: string) => {
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

const getDisabledEncodings = (activeEncodings: Variant[] = []) => {
  const allEncodings: Variant[] = [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH];
  return allEncodings.filter((encoding) => !activeEncodings.includes(encoding));
};

export const getConfigAndBandwidthFromProps = (
  encodings: Variant[] | false | undefined,
  bandwidthLimits: BandwidthLimits,
) => {
  if (!encodings) return [bandwidthLimits.singleStream, undefined] as const;

  const config: SimulcastConfig = {
    enabled: true,
    enabledVariants: encodings,
    disabledVariants: getDisabledEncodings(encodings),
  };

  const variantEntries = Object.entries(bandwidthLimits.simulcast).map(
    ([key, value]) => [Number(key), value] as [Variant, number],
  );

  const bandwidth = new Map<Variant, number>(variantEntries);
  return [bandwidth, config] as const;
};

function getCertainTypeTracks(stream: MediaStream, type: "audio" | "video") {
  if (type === "audio") return stream.getAudioTracks();
  return stream.getVideoTracks();
}

export function getTrackFromStream(stream: MediaStream, type: "audio" | "video") {
  return getCertainTypeTracks(stream, type)[0] ?? null;
}

export function stopStream(stream: MediaStream, type: "audio" | "video") {
  getCertainTypeTracks(stream, type).forEach((track) => {
    track.enabled = false;
    track.stop();
  });
}

import type { FishjamTrackContext, Peer, SimulcastConfig, TrackMetadata } from "@fishjam-cloud/ts-client";
import { Variant } from "@fishjam-cloud/ts-client";

import type { PlatformMediaStream, PlatformMediaStreamTrack } from "../devices/deviceManager";
import type { BandwidthLimits } from "../mediaTypes";

type LocalPeerSource = {
  getLocalPeer(): Pick<Peer, "tracks"> | null;
};

// In most cases, the track is identified by its remote track ID.
// This ID comes from the `addTrack` method.
// However, we don't have that ID before the `addTrack` method returns it.
// For that brief moment, the local track ID from the PlatformMediaStreamTrack object
// identifies the track instead.
export const getRemoteOrLocalTrackContext = (
  client: LocalPeerSource,
  remoteOrLocalTrackId: string,
): FishjamTrackContext | null => {
  const tracks = client.getLocalPeer()?.tracks;
  if (!tracks) return null;

  const trackByRemoteId = tracks.get(remoteOrLocalTrackId);
  if (trackByRemoteId) return trackByRemoteId as FishjamTrackContext;

  const trackByLocalId = [...tracks.values()].find(({ track }) => track?.id === remoteOrLocalTrackId);
  return (trackByLocalId as FishjamTrackContext) ?? null;
};

const getDisabledEncodings = (activeEncodings: Variant[] = []) => {
  const allEncodings: Variant[] = [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH];
  return allEncodings.filter((encoding) => !activeEncodings.includes(encoding));
};

export const getConfigAndBandwidthFromProps = (
  encodings: Variant[] | false | undefined,
  bandwidthLimits: BandwidthLimits,
): readonly [number | Map<Variant, number>, SimulcastConfig | undefined] => {
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

function getCertainTypeTracks(stream: PlatformMediaStream, type: "audio" | "video") {
  if (type === "audio") return stream.getAudioTracks();
  return stream.getVideoTracks();
}

export function getTrackFromStream(
  stream: PlatformMediaStream,
  type: "audio" | "video",
): PlatformMediaStreamTrack | null {
  return getCertainTypeTracks(stream, type)[0] ?? null;
}

export function stopStream(stream: PlatformMediaStream, type: "audio" | "video"): void {
  getCertainTypeTracks(stream, type).forEach((track) => {
    track.enabled = false;
    track.stop();
  });
}

export type { TrackMetadata };

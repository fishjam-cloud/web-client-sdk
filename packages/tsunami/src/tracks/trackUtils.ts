import type { SimulcastConfig, TrackMetadata } from "@fishjam-cloud/ts-client";
import { Variant } from "@fishjam-cloud/ts-client";

import type { PlatformMediaStream, PlatformMediaStreamTrack } from "../devices/deviceManager";
import type { BandwidthLimits } from "../mediaTypes";

const ALL_VARIANTS: Variant[] = [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH];

const getDisabledEncodings = (enabledVariants: Variant[]): Variant[] =>
  ALL_VARIANTS.filter((variant) => !enabledVariants.includes(variant));

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

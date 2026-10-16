import type { EncodingReason, Metadata, Peer, SimulcastConfig, TrackMetadata, Variant } from "@fishjam-cloud/ts-client";

import type { PlatformMediaStream, PlatformMediaStreamTrack } from "../devices/deviceManager";

export type PeerTrackView = {
  metadata?: TrackMetadata;
  trackId: string;
  stream: PlatformMediaStream | null;
  simulcastConfig: SimulcastConfig | null;
  track: PlatformMediaStreamTrack | null;
};

export type RemotePeerTrackView = PeerTrackView & {
  encoding?: Variant;
  encodingReason?: EncodingReason;
  setReceivedQuality: (quality: Variant) => void;
};

/** A peer with its tracks bucketed by their metadata type. */
export type PeerWithTracksView<PeerMetadata, ServerMetadata, TrackView extends PeerTrackView = PeerTrackView> = {
  id: string;
  metadata?: Metadata<PeerMetadata, ServerMetadata>;
  tracks: TrackView[];
  cameraTrack?: TrackView;
  microphoneTrack?: TrackView;
  screenShareVideoTrack?: TrackView;
  screenShareAudioTrack?: TrackView;
  customVideoTracks: TrackView[];
  customAudioTracks: TrackView[];
};

/** The narrow surface remote track views adjust receive quality through. */
export type RemoteTrackQualitySetter = {
  setTargetTrackEncoding(trackId: string, encoding: Variant): void;
};

type PeerTrackContext = {
  metadata?: unknown;
  trackId: string;
  stream: MediaStream | null;
  simulcastConfig?: SimulcastConfig | null;
  track: MediaStreamTrack | null;
  encoding?: Variant;
  encodingReason?: EncodingReason;
};

const trackContextToView = (context: PeerTrackContext): PeerTrackView => ({
  metadata: context.metadata as TrackMetadata,
  trackId: context.trackId,
  stream: context.stream,
  simulcastConfig: context.simulcastConfig ?? null,
  track: context.track,
});

const buildPeerView = <PeerMetadata, ServerMetadata, TrackView extends PeerTrackView>(
  peer: Peer<PeerMetadata, ServerMetadata>,
  toTrackView: (context: PeerTrackContext) => TrackView,
): PeerWithTracksView<PeerMetadata, ServerMetadata, TrackView> => {
  const tracks = [...peer.tracks.values()].map(toTrackView);

  return {
    id: peer.id,
    metadata: peer.metadata,
    tracks,
    cameraTrack: tracks.find(({ metadata }) => metadata?.type === "camera"),
    microphoneTrack: tracks.find(({ metadata }) => metadata?.type === "microphone"),
    screenShareVideoTrack: tracks.find(({ metadata }) => metadata?.type === "screenShareVideo"),
    screenShareAudioTrack: tracks.find(({ metadata }) => metadata?.type === "screenShareAudio"),
    customVideoTracks: tracks.filter(({ metadata }) => metadata?.type === "customVideo"),
    customAudioTracks: tracks.filter(({ metadata }) => metadata?.type === "customAudio"),
  };
};

export const localPeerWithTracks = <PeerMetadata, ServerMetadata>(
  peer: Peer<PeerMetadata, ServerMetadata>,
): PeerWithTracksView<PeerMetadata, ServerMetadata> => buildPeerView(peer, trackContextToView);

export const remotePeerWithTracks = <PeerMetadata, ServerMetadata>(
  peer: Peer<PeerMetadata, ServerMetadata>,
  qualitySetter: RemoteTrackQualitySetter,
): PeerWithTracksView<PeerMetadata, ServerMetadata, RemotePeerTrackView> =>
  buildPeerView(peer, (context) => ({
    ...trackContextToView(context),
    encoding: context.encoding,
    encodingReason: context.encodingReason,
    setReceivedQuality: (quality: Variant) => {
      qualitySetter.setTargetTrackEncoding(context.trackId, quality);
    },
  }));

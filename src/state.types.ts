import type { TrackEncoding, VadStatus } from "@jellyfish-dev/ts-client-sdk";
import type { Api } from "./api";
import { JellyfishClient } from "@jellyfish-dev/ts-client-sdk";
import { UseUserMediaState } from "./useUserMedia/types";
import { UseCameraAndMicrophoneResult } from "./useCameraAndMicrophone/types";

export type TrackId = string;
export type PeerId = string;

export type SimulcastConfig = {
  enabled: boolean | null;
  activeEncodings: TrackEncoding[];
};

export type Track<TrackMetadata> = {
  stream: MediaStream | null;
  encoding: TrackEncoding | null;
  trackId: TrackId;
  metadata: TrackMetadata | null;
  simulcastConfig: SimulcastConfig | null;
  vadStatus: VadStatus;
  track: MediaStreamTrack | null;
};

export interface Origin {
  id: string;
  type: string;
  metadata: any;
}

export type TrackWithOrigin<TrackMetadata> = Track<TrackMetadata> & {
  origin: Origin;
};

export type Peer<PeerMetadata, TrackMetadata> = {
  id: PeerId;
  metadata: PeerMetadata | null;
  tracks: Record<TrackId, Track<TrackMetadata>>;
};

export type Connectivity<PeerMetadata, TrackMetadata> = {
  api: Api<TrackMetadata> | null;
  client: JellyfishClient<PeerMetadata, TrackMetadata> | null;
};

export type PeerStatus = "connecting" | "connected" | "authenticated" | "joined" | "error" | null;
export type State<PeerMetadata, TrackMetadata> = {
  local: Peer<PeerMetadata, TrackMetadata> | null;
  remote: Record<PeerId, Peer<PeerMetadata, TrackMetadata>>;
  tracks: Record<TrackId, TrackWithOrigin<TrackMetadata>>;
  bandwidthEstimation: bigint;
  status: PeerStatus;
  media: UseUserMediaState;
  devices: UseCameraAndMicrophoneResult<TrackMetadata>;
  connectivity: Connectivity<PeerMetadata, TrackMetadata>;
};

export type SetStore<PeerMetadata, TrackMetadata> = (
  setter: (prevState: State<PeerMetadata, TrackMetadata>) => State<PeerMetadata, TrackMetadata>
) => void;

export type Selector<PeerMetadata, TrackMetadata, Result> = (snapshot: State<PeerMetadata, TrackMetadata>) => Result;

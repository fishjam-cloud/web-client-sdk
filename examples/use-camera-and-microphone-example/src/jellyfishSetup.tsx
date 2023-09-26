import { create } from "@jellyfish-dev/react-client-sdk";

export type PeerMetadata = {
  name: string;
};

export type TrackMetadata = {
  type: "camera" | "microphone";
  mode: "auto" | "manual";
};

export const DEFAULT_VIDEO_TRACK_METADATA: TrackMetadata = {
  type: "camera",
  mode: "auto",
};

export const MANUAL_VIDEO_TRACK_METADATA: TrackMetadata = {
  type: "camera",
  mode: "manual",
};

export const DEFAULT_AUDIO_TRACK_METADATA: TrackMetadata = {
  type: "microphone",
  mode: "auto",
};

export const MANUAL_AUDIO_TRACK_METADATA: TrackMetadata = {
  type: "microphone",
  mode: "manual",
};

export const {
  useApi,
  useTracks,
  useStatus,
  useConnect,
  useDisconnect,
  JellyfishContextProvider,
  useSetupCameraAndMicrophone,
  useCamera,
  useMicrophone,
  useSelector,
} = create<PeerMetadata, TrackMetadata>();

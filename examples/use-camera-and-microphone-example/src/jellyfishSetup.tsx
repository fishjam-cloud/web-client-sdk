import { create } from "@jellyfish-dev/react-client-sdk";
import { z } from "zod";

const peerMetadataSchema = z.object({
  name: z.string(),
});

const trackMetadataSchema = z.object({
  type: z.union([z.literal("camera"), z.literal("microphone"), z.literal("screenshare")]),
  mode: z.union([z.literal("auto"), z.literal("manual")]),
});

export type PeerMetadata = z.infer<typeof peerMetadataSchema>;

export type TrackMetadata = z.infer<typeof trackMetadataSchema>;

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

export const DEFAULT_SCREENSHARE_TRACK_METADATA: TrackMetadata = {
  type: "screenshare",
  mode: "auto",
};

export const MANUAL_SCREENSHARE_TRACK_METADATA: TrackMetadata = {
  type: "screenshare",
  mode: "manual",
};

export const EXAMPLE_PEER_METADATA: PeerMetadata = {
  name: "John Doe",
};

export const {
  useApi,
  useTracks,
  useStatus,
  useConnect,
  useDisconnect,
  JellyfishContextProvider,
  useSetupMedia,
  useCamera,
  useMicrophone,
  useScreenshare,
  useSelector,
} = create<PeerMetadata, TrackMetadata>({
  peerMetadataParser: (obj) => peerMetadataSchema.parse(obj),
  trackMetadataParser: (obj) => trackMetadataSchema.passthrough().parse(obj),
});

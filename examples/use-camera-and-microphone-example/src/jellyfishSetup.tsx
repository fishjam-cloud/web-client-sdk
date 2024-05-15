import { z } from "zod";
import { ClientEvents, create } from "@jellyfish-dev/react-client-sdk";
import { useEffect, useState } from "react";

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

export const DEFAULT_SCREEN_SHARE_TRACK_METADATA: TrackMetadata = {
  type: "screenshare",
  mode: "auto",
};

export const MANUAL_SCREEN_SHARE_TRACK_METADATA: TrackMetadata = {
  type: "screenshare",
  mode: "manual",
};

export const EXAMPLE_PEER_METADATA: PeerMetadata = {
  name: "John Doe",
};

export const {
  useStatus,
  useConnect,
  useDisconnect,
  JellyfishContextProvider,
  useSetupMedia,
  useCamera,
  useMicrophone,
  useScreenShare,
  useSelector,
  useClient,
} = create<PeerMetadata, TrackMetadata>({
  peerMetadataParser: (obj) => peerMetadataSchema.parse(obj),
  trackMetadataParser: (obj) => trackMetadataSchema.passthrough().parse(obj),
});

export const useAuthErrorReason = () => {
  const client = useClient();
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const authError: ClientEvents<PeerMetadata, TrackMetadata>["authError"] = (reason) => {
      setAuthError(reason);
    };

    const authSuccess: ClientEvents<PeerMetadata, TrackMetadata>["authSuccess"] = () => {
      setAuthError(null);
    };

    client.on("authError", authError);
    client.on("authSuccess", authSuccess);

    return () => {
      client.removeListener("authError", authError);
      client.removeListener("authSuccess", authSuccess);
    };
  }, [setAuthError, client]);

  return authError;
};

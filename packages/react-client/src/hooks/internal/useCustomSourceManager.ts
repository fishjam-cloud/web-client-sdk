import { type FishjamClient, type TrackMetadata, TrackTypeError } from "@fishjam-cloud/ts-client";
import { useState } from "react";

import type { CustomSourceState } from "../../types/internal";
import type { PeerStatus } from "../../types/public";

type CustomSourceManagerProps = {
  stream: MediaStream;
  fishjamClient: FishjamClient;
  peerStatus: PeerStatus;
};

export function useCustomSourceManager({ fishjamClient, stream, peerStatus }: CustomSourceManagerProps) {
  const [state, setState] = useState<CustomSourceState>({ trackIds: {} });

  const addTrackToFishjamClient = async (track: MediaStreamTrack, trackMetadata: TrackMetadata) => {
    try {
      return fishjamClient.addTrack(track, trackMetadata);
    } catch (err) {
      if (err instanceof TrackTypeError) {
        console.warn(err.message);
        return undefined;
      }
      throw err;
    }
  };

  const getDisplayName = () => {
    const name = fishjamClient.getLocalPeer()?.metadata?.peer?.displayName;
    if (typeof name == "string") return name;
  };

  const startStreaming = async () => {
    const [video, audio] = getTracks();

    const promises = [];
    if (video) {
      const videoMetadata = { type: "customVideo", displayName: getDisplayName(), paused: false } as const;
      promises.push(addTrackToFishjamClient(video, videoMetadata));
    }
    if (audio) {
      const audioMetadata = { type: "customAudio", displayName: getDisplayName(), paused: false } as const;
      promises.push(addTrackToFishjamClient(audio, audioMetadata));
    }

    if (promises.length === 0) {
      console.warn("Attempted to add empty MediaStream as custom source, doing nothing.");
    } else {
      const [videoId, audioId] = await Promise.all(promises);
      setState({ trackIds: { videoId, audioId } });
    }
  };

  const stopStreaming = async () => {
    if (peerStatus === "connected") {
      const { videoId, audioId } = state.trackIds;
      if (videoId) fishjamClient.removeTrack(videoId);
      if (audioId) fishjamClient.removeTrack(audioId);
    }
    setState({ trackIds: {} });
  };

  const getTracks = () => [stream.getVideoTracks().at(0), stream.getAudioTracks().at(0)];

  return { startStreaming, stopStreaming };
}

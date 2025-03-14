import type { WebRTCEndpoint } from "@fishjam-cloud/ts-client";
import { Variant, type WebRTCEndpointEvents } from "@fishjam-cloud/webrtc-client";
import { useEffect, useState } from "react";

import { brain2Mock, heart2Mock } from "./MockComponent";
import { VideoPlayer } from "./VideoPlayer";

type Props = {
  webrtc: WebRTCEndpoint;
};

export const MuteTrackTest = ({ webrtc }: Props) => {
  const [currentStream, setCurrentStream] = useState<MediaStream | null>();
  const [currentTrack, setCurrentTrack] = useState<MediaStreamTrack | null>();
  const [trackId, setTrackId] = useState<string | null>(null);

  useEffect(() => {
    const localTrackAdded: WebRTCEndpointEvents["localTrackAdded"] = (event) => {
      setCurrentStream(event.stream);
      setCurrentTrack(event.track);
      setTrackId(event.trackId);
    };

    const localTrackReplaced: WebRTCEndpointEvents["localTrackReplaced"] = (event) => {
      setCurrentTrack(event.track);
    };

    webrtc.on("localTrackAdded", localTrackAdded);
    webrtc.on("localTrackReplaced", localTrackReplaced);

    return () => {
      webrtc.removeListener("localTrackAdded", localTrackAdded);
      webrtc.removeListener("localTrackReplaced", localTrackReplaced);
    };
  }, [webrtc]);

  const addTrack = async (stream: MediaStream) => {
    const track = stream.getVideoTracks()[0];

    if (!track) throw Error("Stream doesn't have any track");

    await webrtc.addTrack(
      track,
      { goodTrack: "camera" },
      {
        enabled: true,
        enabledVariants: [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH],
        disabledVariants: [],
      },
    );
  };

  const replaceTrack = async (
    replaceTrackId: string | null,
    stream: MediaStream | null,
    track: MediaStreamTrack | null,
  ) => {
    if (!replaceTrackId) throw Error("Track id is null");

    await webrtc.replaceTrack(replaceTrackId, track);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "8px",
        borderStyle: "dotted",
        borderWidth: "1px",
        borderColor: "black",
      }}
    >
      <div>
        <span>track: {currentTrack?.id ?? "null"}</span>
      </div>
      <div>
        <button disabled={!!currentStream || !!trackId} onClick={() => addTrack(heart2Mock.stream)}>
          Add heart
        </button>
        <button disabled={!!currentStream || !!trackId} onClick={() => addTrack(brain2Mock.stream)}>
          Add brain
        </button>
        <button onClick={() => replaceTrack(trackId, heart2Mock.stream, heart2Mock.stream.getVideoTracks()[0])}>
          Replace with heart
        </button>
        <button onClick={() => replaceTrack(trackId, brain2Mock.stream, brain2Mock.stream.getVideoTracks()[0])}>
          Replace with brain
        </button>
        <button onClick={() => replaceTrack(trackId, null, null)}>Mute track</button>
      </div>

      <div>{currentStream && <VideoPlayer stream={currentStream} />}</div>
    </div>
  );
};

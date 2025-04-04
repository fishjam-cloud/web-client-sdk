import { type BandwidthLimit, type SimulcastConfig, Variant, type WebRTCEndpoint } from "@fishjam-cloud/ts-client";
import { useRef, useState } from "react";

import { createStream } from "./mocks";
import { MuteTrackTest } from "./MuteTrackTest";
import { VideoPlayer } from "./VideoPlayer";

// eslint-disable-next-line react-refresh/only-export-components
export const brainMock = createStream("🧠", "white", "low", 24);

// eslint-disable-next-line react-refresh/only-export-components
export const brain2Mock = createStream("🤯", "#00ff00", "low", 24);

// eslint-disable-next-line react-refresh/only-export-components
export const heartMock = createStream("🫀", "white", "low", 24);

// eslint-disable-next-line react-refresh/only-export-components
export const heart2Mock = createStream("💝", "#FF0000", "low", 24);

type Props = {
  webrtc: WebRTCEndpoint;
};

export const MockComponent = ({ webrtc }: Props) => {
  const heartId = useRef<Promise<string> | null>(null);
  const brainId = useRef<Promise<string> | null>(null);
  const [replaceStatus, setReplaceStatus] = useState<"unknown" | "success" | "failure">("unknown");
  const [trackMetadataInput, setTrackMetadataInput] = useState(JSON.stringify({ goodTrack: "ye" }));

  const addHeart = async () => {
    const stream = heartMock.stream;
    const track = stream.getVideoTracks()[0];

    heartId.current = webrtc.addTrack(track, JSON.parse(trackMetadataInput));
  };

  const removeHeart = async () => {
    if (!heartId.current) throw Error("Heart id is undefined");

    webrtc.removeTrack(await heartId.current);
  };

  const removeBrain = async () => {
    if (!brainId.current) throw Error("Brain id is undefined");

    webrtc.removeTrack(await brainId.current);
  };

  const replaceHeart = async () => {
    if (!heartId.current) throw Error("Track Id is not set");

    const stream = heart2Mock.stream;
    const track = stream.getVideoTracks()[0];

    await webrtc.replaceTrack(await heartId.current, track);
    setReplaceStatus("success");
  };

  const replaceBrain = async () => {
    if (!brainId.current) throw Error("Track Id is not set");

    const stream = brain2Mock.stream;
    const track = stream.getVideoTracks()[0];

    await webrtc.replaceTrack(await brainId.current, track);
  };

  const addBrain = () => {
    const stream = brainMock.stream;
    const track = stream.getVideoTracks()[0];

    const simulcastConfig: SimulcastConfig = {
      enabled: true,
      enabledVariants: [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH],
      disabledVariants: [],
    };
    const maxBandwidth: BandwidthLimit = 0;

    brainId.current = webrtc.addTrack(track, JSON.parse(trackMetadataInput), simulcastConfig, maxBandwidth);
  };

  const addBoth = () => {
    addHeart();
    addBrain();
  };

  const addAndReplaceHeart = () => {
    addHeart();
    replaceHeart();
  };

  const addAndRemoveHeart = () => {
    addHeart();
    removeHeart();
  };

  const updateMetadataOnLastTrack = async () => {
    const awaitedHeartId = await heartId.current;
    if (!awaitedHeartId) return;
    webrtc.updateTrackMetadata(awaitedHeartId, JSON.parse(trackMetadataInput));
  };

  return (
    <div>
      <input
        value={trackMetadataInput}
        onChange={(e) => setTrackMetadataInput(e.target.value)}
        placeholder="track metadata"
      />
      <button onClick={updateMetadataOnLastTrack}>Update metadata on heart track</button>
      <div>
        <VideoPlayer stream={heartMock.stream} />
        <button onClick={addHeart}>Add a heart</button>
        <button onClick={removeHeart}>Remove a heart</button>
        <VideoPlayer stream={heart2Mock.stream} />
        <button onClick={replaceHeart}>Replace a heart</button>
        <div>
          <span>Replace status: </span>
          <span data-replace-status={replaceStatus}>{replaceStatus}</span>
        </div>
      </div>
      <div>
        <VideoPlayer stream={brainMock.stream} />
        <button onClick={addBrain}>Add a brain</button>
        <button onClick={removeBrain}>Remove a brain</button>
        <VideoPlayer stream={brain2Mock.stream} />
        <button onClick={replaceBrain}>Replace a brain</button>
      </div>

      <button onClick={addBoth}>Add both</button>
      <button onClick={addAndReplaceHeart}>Add and replace a heart</button>
      <button onClick={addAndRemoveHeart}>Add and remove a heart</button>

      <MuteTrackTest webrtc={webrtc} />
    </div>
  );
};

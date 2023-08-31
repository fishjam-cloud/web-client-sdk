import {
  TrackMetadata,
  useCameraAndMicrophone,
  useConnect,
  useDisconnect,
  useSelector,
  useStatus,
} from "./jellyfishSetup";
import VideoPlayer from "./VideoPlayer";
import { DeviceSelector } from "./DeviceSelector";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { ThreeStateRadio } from "./ThreeStateRadio";
import AudioVisualizer from "./AudioVisualizer";
import { AUDIO_TRACK_CONSTRAINTS, VIDEO_TRACK_CONSTRAINTS } from "@jellyfish-dev/react-client-sdk";
import { Fragment } from "react";
import { Badge } from "./Badge";

const tokenAtom = atomWithStorage("token", "");

const videoAutoStreamingAtom = atomWithStorage<boolean | undefined>("videoAutoStreaming", undefined);
const videoPreviewAtom = atomWithStorage<boolean | undefined>("videoPreview", undefined);

const audioAutoStreamingAtom = atomWithStorage<boolean | undefined>("audioAutoStreaming", undefined);
const audioPreviewAtom = atomWithStorage<boolean | undefined>("audioPreviewAtom", undefined);

const DEFAULT_VIDEO_TRACK_METADATA: TrackMetadata = {
  type: "camera",
  mode: "auto",
};

const MANUAL_VIDEO_TRACK_METADATA: TrackMetadata = {
  type: "camera",
  mode: "manual",
};

const DEFAULT_AUDIO_TRACK_METADATA: TrackMetadata = {
  type: "microphone",
  mode: "auto",
};

const MANUAL_AUDIO_TRACK_METADATA: TrackMetadata = {
  type: "microphone",
  mode: "manual",
};

export const App = () => {
  const [token, setToken] = useAtom(tokenAtom);

  const connect = useConnect();
  const disconnect = useDisconnect();
  const local = useSelector((s) => Object.values(s.local?.tracks || {}));

  const [videoAutoStreaming, setVideoAutoStreaming] = useAtom(videoAutoStreamingAtom);
  const [videoPreview, setVideoPreview] = useAtom(videoPreviewAtom);

  const [audioAutoStreaming, setAudioAutoStreaming] = useAtom(audioAutoStreamingAtom);
  const [audioPreview, setAudioPreview] = useAtom(audioPreviewAtom);

  const { audio, video, init, start } = useCameraAndMicrophone({
    camera: {
      trackConstraints: VIDEO_TRACK_CONSTRAINTS,
      autoStreaming: videoAutoStreaming,
      preview: videoPreview,
      defaultTrackMetadata: DEFAULT_VIDEO_TRACK_METADATA,
      defaultSimulcastConfig: {
        enabled: true,
        active_encodings: ["l", "m", "h"],
      },
    },
    microphone: {
      trackConstraints: AUDIO_TRACK_CONSTRAINTS,
      autoStreaming: audioAutoStreaming,
      preview: audioPreview,
      defaultTrackMetadata: DEFAULT_AUDIO_TRACK_METADATA,
    },
    startOnMount: false,
    storage: true,
  });

  const status = useStatus();

  return (
    <div className="flex flex-row flex-wrap md:grid md:grid-cols-2 gap-2 p-2">
      <div className="flex flex-col gap-2">
        <input
          type="text"
          className="input input-bordered w-full"
          value={token}
          onChange={(e) => setToken(() => e?.target?.value)}
          placeholder="token"
        />
        <div className="flex flex-col w-full">
          <ThreeStateRadio
            name="Video Auto Streaming (default false)"
            value={videoAutoStreaming}
            set={setVideoAutoStreaming}
            radioClass="radio-primary"
          />

          <ThreeStateRadio
            name="Video Preview (default true)"
            value={videoPreview}
            set={setVideoPreview}
            radioClass="radio-primary"
          />

          <ThreeStateRadio
            name="Audio Auto Streaming (default false)"
            value={audioAutoStreaming}
            set={setAudioAutoStreaming}
            radioClass="radio-secondary"
          />
          <ThreeStateRadio
            name="Audio Preview (default true)"
            value={audioPreview}
            set={setAudioPreview}
            radioClass="radio-secondary"
          />
        </div>
        <div className="flex flex-row flex-wrap w-full gap-2">
          <button
            className="btn btn-info btn-sm"
            onClick={() => {
              init();
            }}
          >
            Start devices
          </button>

          <button
            className="btn btn-success btn-sm"
            disabled={token === "" || status !== null}
            onClick={() => {
              if (!token || token === "") throw Error("Token is empty");
              connect({
                peerMetadata: { name: "John Doe" }, // example metadata
                token: token,
              });
            }}
          >
            Connect
          </button>
          <button
            className="btn btn-error btn-sm"
            disabled={status === null}
            onClick={() => {
              disconnect();
            }}
          >
            Disconnect
          </button>

          <Badge status={status} />
        </div>
        <DeviceSelector
          name="Video"
          devices={video?.devices || null}
          setInput={(id) => {
            if (!id) return;
            start({ videoDeviceId: id });
          }}
          defaultOptionText="Select video device"
        />

        <DeviceSelector
          name="Audio"
          devices={audio?.devices || null}
          setInput={(id) => {
            if (!id) return;
            start({ audioDeviceId: id });
          }}
          defaultOptionText="Select audio device"
        />

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2">
            <button
              className="btn btn-success btn-sm"
              disabled={!!video.stream}
              // todo start previous stream
              // disabled={true}
              onClick={() => {
                video.start();
              }}
            >
              Start video device
            </button>
            <button
              className="btn btn-error btn-sm"
              disabled={!video.stream}
              onClick={() => {
                video.stop();
              }}
            >
              Stop video device
            </button>
            <button
              className="btn btn-success btn-sm"
              disabled={!video.stream || video.enabled}
              onClick={() => {
                video.setEnable(true);
              }}
            >
              Enable video track
            </button>
            <button
              className="btn btn-error btn-sm"
              disabled={!video.enabled}
              onClick={() => {
                video.setEnable(false);
              }}
            >
              Disable video track
            </button>
            <button
              className="btn btn-success btn-sm"
              disabled={status !== "joined" || !video?.stream || !!video?.broadcast?.trackId}
              onClick={() => {
                video.addTrack(MANUAL_VIDEO_TRACK_METADATA);
              }}
            >
              Stream video track
            </button>
            <button
              className="btn btn-error btn-sm"
              disabled={status !== "joined" || !video?.stream || !video?.broadcast?.trackId}
              onClick={() => {
                video.removeTrack();
              }}
            >
              Stop video track stream
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <button
              className="btn btn-success btn-sm"
              disabled={!!audio.stream}
              onClick={() => {
                audio.start();
              }}
            >
              Start audio device
            </button>
            <button
              className="btn btn-error btn-sm"
              disabled={!audio.stream}
              onClick={() => {
                audio.stop();
              }}
            >
              Stop audio device
            </button>
            <button
              className="btn btn-success btn-sm"
              disabled={!audio.stream || audio.enabled}
              onClick={() => {
                audio.setEnable(true);
              }}
            >
              Enable audio track
            </button>
            <button
              className="btn btn-error btn-sm"
              disabled={!audio.enabled}
              onClick={() => {
                audio.setEnable(false);
              }}
            >
              Disable audio track
            </button>
            <button
              className="btn btn-success btn-sm"
              disabled={status !== "joined" || !audio?.stream || !!audio?.broadcast?.trackId}
              onClick={() => {
                audio.addTrack(MANUAL_AUDIO_TRACK_METADATA);
              }}
            >
              Stream audio track
            </button>
            <button
              className="btn btn-error btn-sm"
              disabled={status !== "joined" || !audio?.stream || !audio?.broadcast?.trackId}
              onClick={() => {
                audio.removeTrack();
              }}
            >
              Stop audio track stream
            </button>
          </div>
        </div>
      </div>
      <div>
        <div className="grid grid-rows-2 prose">
          <div>
            <h3>Local:</h3>
            <div className="max-w-[500px]">
              {video?.track?.kind === "video" && <VideoPlayer stream={video?.stream} />}
              {audio?.track?.kind === "audio" && <AudioVisualizer stream={audio?.stream} />}
            </div>
          </div>
          <div>
            <h3>Streaming:</h3>
            {local.map(({ trackId, stream, track }) => (
              <Fragment key={trackId}>
                <div className="max-w-[500px]">
                  {track?.kind === "video" && <VideoPlayer key={trackId} stream={stream} />}
                  {track?.kind === "audio" && <AudioVisualizer stream={stream} />}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;

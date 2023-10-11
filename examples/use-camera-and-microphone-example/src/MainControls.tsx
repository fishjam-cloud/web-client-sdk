import {
  DEFAULT_AUDIO_TRACK_METADATA,
  DEFAULT_VIDEO_TRACK_METADATA,
  MANUAL_AUDIO_TRACK_METADATA,
  MANUAL_SCREENSHARE_TRACK_METADATA,
  MANUAL_VIDEO_TRACK_METADATA,
  useCamera,
  useConnect,
  useDisconnect,
  useMicrophone,
  useScreenshare,
  useSelector,
  useSetupMedia,
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
import { DeviceControls } from "./DeviceControls";

const tokenAtom = atomWithStorage("token", "");

const videoAutoStreamingAtom = atomWithStorage<boolean | undefined>("videoAutoStreaming", undefined);
const videoPreviewAtom = atomWithStorage<boolean | undefined>("videoPreview", undefined);

const audioAutoStreamingAtom = atomWithStorage<boolean | undefined>("audioAutoStreaming", undefined);
const audioPreviewAtom = atomWithStorage<boolean | undefined>("audioPreviewAtom", undefined);

const autostartAtom = atomWithStorage<boolean>("autostart", false, undefined, { unstable_getOnInit: true });

export const MainControls = () => {
  const [token, setToken] = useAtom(tokenAtom);

  const connect = useConnect();
  const disconnect = useDisconnect();
  const local = useSelector((s) => Object.values(s.local?.tracks || {}));

  const [videoAutoStreaming, setVideoAutoStreaming] = useAtom(videoAutoStreamingAtom);
  const [videoPreview, setVideoPreview] = useAtom(videoPreviewAtom);

  const [audioAutoStreaming, setAudioAutoStreaming] = useAtom(audioAutoStreamingAtom);
  const [audioPreview, setAudioPreview] = useAtom(audioPreviewAtom);

  const [autostart, setAutostart] = useAtom(autostartAtom);

  const { init } = useSetupMedia({
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
    screenshare: {
      trackConstraints: true,
      defaultTrackMetadata: DEFAULT_VIDEO_TRACK_METADATA,
    },
    startOnMount: autostart,
    storage: true,
  });

  const video = useCamera();
  const audio = useMicrophone();
  const screenshare = useScreenshare();
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
        <div className="flex flex-row">
          <div className="form-control">
            <label className="flex flex-row gap-2 label cursor-pointer">
              <span className="label-text">Autostart</span>
              <input
                type="checkbox"
                checked={autostart}
                onChange={() => setAutostart(!autostart)}
                className="checkbox"
              />
            </label>
          </div>
        </div>
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
            video.start(id);
          }}
          defaultOptionText="Select video device"
        />

        <DeviceSelector
          name="Audio"
          devices={audio?.devices || null}
          setInput={(id) => {
            if (!id) return;
            audio.start(id);
          }}
          defaultOptionText="Select audio device"
        />

        <div className="grid grid-cols-3 gap-2">
          <DeviceControls device={video} type="video" status={status} metadata={MANUAL_VIDEO_TRACK_METADATA} />
          <DeviceControls device={audio} type="audio" status={status} metadata={MANUAL_AUDIO_TRACK_METADATA} />
          <DeviceControls
            device={screenshare}
            type="screenshare"
            status={status}
            metadata={MANUAL_SCREENSHARE_TRACK_METADATA}
          />
        </div>
      </div>
      <div>
        <div className="grid grid-rows-2 prose">
          <div>
            <h3>Local:</h3>
            <div className="max-w-[500px]">
              {video?.track?.kind === "video" && <VideoPlayer stream={video?.stream} />}
              {audio?.track?.kind === "audio" && <AudioVisualizer stream={audio?.stream} />}
              {screenshare?.track?.kind === "video" && <VideoPlayer stream={screenshare?.stream} />}
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

export default MainControls;

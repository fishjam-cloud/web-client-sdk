import VideoPlayer from "./VideoPlayer";
import { DeviceSelector } from "./DeviceSelector";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { ThreeStateRadio } from "./ThreeStateRadio";
import AudioVisualizer from "./AudioVisualizer";
import type { Track } from "@fishjam-cloud/react-client";
import {
  useCamera,
  useConnect,
  useDisconnect,
  useInitializeDevices,
  useMicrophone,
  usePeers,
  useScreenShare,
  useStatus,
} from "@fishjam-cloud/react-client";
import { Badge } from "./Badge";
import { DeviceControls } from "./DeviceControls";
import { Radio } from "./Radio";
import { ScreenShareControls } from "./ScreenShareControls";

type OnDeviceChange = "remove" | "replace" | undefined;
type OnDeviceStop = "remove" | "mute" | undefined;

const isDeviceChangeValue = (e: string | undefined): e is OnDeviceChange =>
  e === undefined || e === "remove" || e === "replace";

const isDeviceStopValue = (e: string | undefined): e is OnDeviceStop =>
  e === undefined || e === "remove" || e === "mute";

const tokenAtom = atomWithStorage("token", "");

const broadcastVideoOnConnectAtom = atomWithStorage<boolean | undefined>(
  "broadcastVideoOnConnect",
  undefined,
);
const broadcastVideoOnDeviceStartAtom = atomWithStorage<boolean | undefined>(
  "broadcastVideoOnDeviceStart",
  undefined,
);
const videoOnDeviceChangeAtom = atomWithStorage<OnDeviceChange>(
  "videoOnDeviceChange",
  undefined,
);
const videoOnDeviceStopAtom = atomWithStorage<OnDeviceStop>(
  "videoOnDeviceStop",
  undefined,
);

const broadcastAudioOnConnectAtom = atomWithStorage<boolean | undefined>(
  "broadcastAudioOnConnect",
  undefined,
);
const broadcastAudioOnDeviceStartAtom = atomWithStorage<boolean | undefined>(
  "broadcastAudioOnDeviceStart",
  undefined,
);
const audioOnDeviceChangeAtom = atomWithStorage<OnDeviceChange>(
  "audioOnDeviceChange",
  undefined,
);
const audioOnDeviceStopAtom = atomWithStorage<OnDeviceStop>(
  "audioOnDeviceStop",
  undefined,
);

const broadcastScreenShareOnConnectAtom = atomWithStorage<boolean | undefined>(
  "broadcastScreenShareOnConnect",
  undefined,
);
const broadcastScreenShareOnDeviceStartAtom = atomWithStorage<
  boolean | undefined
>("broadcastScreenShareOnDeviceStart", undefined);

const autostartAtom = atomWithStorage<boolean>("autostart", false, undefined, {
  getOnInit: true,
});

const FISHJAM_URL = "ws://localhost:5002";

export const MainControls = () => {
  const [token, setToken] = useAtom(tokenAtom);

  const connect = useConnect();
  const disconnect = useDisconnect();

  const { localPeer } = usePeers();
  const localTracks = [
    localPeer?.cameraTrack,
    localPeer?.screenShareVideoTrack,
  ].filter((track): track is Track => Boolean(track));

  const [broadcastVideoOnConnect, setBroadcastVideoOnConnect] = useAtom(
    broadcastVideoOnConnectAtom,
  );
  const [broadcastVideoOnDeviceStart, setBroadcastVideoOnDeviceStart] = useAtom(
    broadcastVideoOnDeviceStartAtom,
  );
  const [broadcastVideoOnDeviceChange, setBroadcastVideoOnDeviceChange] =
    useAtom(videoOnDeviceChangeAtom);
  const [broadcastVideoOnDeviceStop, setBroadcastVideoOnDeviceStop] = useAtom(
    videoOnDeviceStopAtom,
  );

  const [broadcastAudioOnConnect, setBroadcastAudioOnConnect] = useAtom(
    broadcastAudioOnConnectAtom,
  );
  const [broadcastAudioOnDeviceStart, setBroadcastAudioOnDeviceStart] = useAtom(
    broadcastAudioOnDeviceStartAtom,
  );
  const [broadcastAudioOnDeviceChange, setBroadcastAudioOnDeviceChange] =
    useAtom(audioOnDeviceChangeAtom);
  const [broadcastAudioOnDeviceStop, setBroadcastAudioOnDeviceStop] = useAtom(
    audioOnDeviceStopAtom,
  );

  const [broadcastScreenShareOnConnect, setBroadcastScreenShareOnConnect] =
    useAtom(broadcastScreenShareOnConnectAtom);
  const [
    broadcastScreenShareOnDeviceStart,
    setBroadcastScreenShareOnDeviceStart,
  ] = useAtom(broadcastScreenShareOnDeviceStartAtom);

  const [autostart, setAutostart] = useAtom(autostartAtom);

  const video = useCamera();
  const audio = useMicrophone();
  const screenShare = useScreenShare();
  const status = useStatus();

  const { initializeDevices } = useInitializeDevices();

  return (
    <div className="flex flex-row flex-wrap gap-2 p-2 md:grid md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <input
          type="text"
          className="input input-bordered w-full"
          value={token}
          onChange={(e) => setToken(() => e?.target?.value)}
          placeholder="token"
        />

        <div className="flex w-full flex-row flex-wrap items-center gap-2">
          <div className="form-control">
            <label className="label flex cursor-pointer flex-row gap-2">
              <span className="label-text">Autostart</span>

              <input
                type="checkbox"
                checked={autostart}
                onChange={() => setAutostart(!autostart)}
                className="checkbox"
              />
            </label>
          </div>

          <button
            className="btn btn-info btn-sm"
            disabled={
              audio.status !== "uninitialized" ||
              video.status !== "uninitialized"
            }
            onClick={() => {
              initializeDevices();
            }}
          >
            Init device manager
          </button>

          <button
            className="btn btn-success btn-sm"
            disabled={token === "" || status === "connected"}
            onClick={() => {
              if (!token || token === "") throw Error("Token is empty");
              connect({
                token: token,
                url: FISHJAM_URL,
              });
            }}
          >
            Connect
          </button>

          <button
            className="btn btn-success btn-sm"
            disabled={token === ""}
            onClick={() => {
              if (!token || token === "") throw Error("Token is empty");
              disconnect();

              connect({
                token: token,
                url: FISHJAM_URL,
              });
            }}
          >
            Reconnect
          </button>

          <button
            className="btn btn-error btn-sm"
            disabled={status !== "connected"}
            onClick={() => {
              disconnect();
            }}
          >
            Disconnect
          </button>
        </div>

        <div className="flex w-full flex-row flex-wrap items-center gap-2">
          <Badge status={status} />
        </div>

        <div className="flex w-full flex-col">
          <ThreeStateRadio
            name="Broadcast video on connect (default false)"
            value={broadcastVideoOnConnect}
            set={setBroadcastVideoOnConnect}
            radioClass="radio-primary"
          />

          <ThreeStateRadio
            name="Broadcast video on device start (default false)"
            value={broadcastVideoOnDeviceStart}
            set={setBroadcastVideoOnDeviceStart}
            radioClass="radio-primary"
          />

          <Radio
            name='Broadcast video on device change (default "replace")'
            value={broadcastVideoOnDeviceChange}
            set={(value) => {
              if (isDeviceChangeValue(value))
                setBroadcastVideoOnDeviceChange(value);
            }}
            radioClass="radio-primary"
            options={[
              { value: undefined, key: "undefined" },
              { value: "remove", key: "remove" },
              { value: "replace", key: "replace" },
            ]}
          />

          <Radio
            name='Broadcast video on device stop (default "mute")'
            value={broadcastVideoOnDeviceStop}
            set={(value) => {
              if (isDeviceStopValue(value))
                setBroadcastVideoOnDeviceStop(value);
            }}
            radioClass="radio-primary"
            options={[
              { value: undefined, key: "undefined" },
              { value: "remove", key: "remove" },
              { value: "mute", key: "mute" },
            ]}
          />

          <ThreeStateRadio
            name="Broadcast audio on connect (default false)"
            value={broadcastAudioOnConnect}
            set={setBroadcastAudioOnConnect}
            radioClass="radio-secondary"
          />

          <ThreeStateRadio
            name="Broadcast audio on device start (default false)"
            value={broadcastAudioOnDeviceStart}
            set={setBroadcastAudioOnDeviceStart}
            radioClass="radio-secondary"
          />

          <Radio
            name='Broadcast audio on device change (default "replace")'
            value={broadcastAudioOnDeviceChange}
            set={(value) => {
              if (isDeviceChangeValue(value))
                setBroadcastAudioOnDeviceChange(value);
            }}
            radioClass="radio-secondary"
            options={[
              { value: undefined, key: "undefined" },
              { value: "remove", key: "remove" },
              { value: "replace", key: "replace" },
            ]}
          />

          <Radio
            name='Broadcast audio on device stop (default "mute")'
            value={broadcastAudioOnDeviceStop}
            set={(value) => {
              if (isDeviceStopValue(value))
                setBroadcastAudioOnDeviceStop(value);
            }}
            radioClass="radio-secondary"
            options={[
              { value: undefined, key: "undefined" },
              { value: "remove", key: "remove" },
              { value: "mute", key: "mute" },
            ]}
          />

          <ThreeStateRadio
            name="Broadcast screen share on connect (default false)"
            value={broadcastScreenShareOnConnect}
            set={setBroadcastScreenShareOnConnect}
            radioClass="radio-accent"
          />

          <ThreeStateRadio
            name="Broadcast screen share on device start (default false)"
            value={broadcastScreenShareOnDeviceStart}
            set={setBroadcastScreenShareOnDeviceStart}
            radioClass="radio-accent"
          />
        </div>

        <DeviceSelector
          name="Video"
          activeDevice={video.activeDevice?.label ?? null}
          devices={video.devices}
          setInput={(deviceId) => {
            if (!deviceId) return;
            video.initialize(deviceId);
          }}
          defaultOptionText="Select video device"
          stop={() => {
            video.stop();
          }}
        />

        <DeviceSelector
          name="Audio"
          activeDevice={audio.activeDevice?.label ?? null}
          devices={audio.devices || null}
          setInput={(deviceId) => {
            if (!deviceId) return;
            audio.initialize(deviceId);
          }}
          defaultOptionText="Select audio device"
          stop={() => {
            audio.stop();
          }}
        />

        <div className="grid grid-cols-3 gap-2">
          <DeviceControls device={video} type="video" status={status} />

          <DeviceControls device={audio} type="audio" status={status} />

          <ScreenShareControls />
        </div>
      </div>
      <div>
        <div className="prose grid grid-rows-2">
          <div>
            <h3>Local:</h3>

            <p>Video {video.track?.label}</p>

            <p>Audio {audio.track?.label}</p>

            <div className="max-w-[500px]">
              {video.stream && <VideoPlayer stream={video.stream} />}

              {audio.stream && (
                <AudioVisualizer
                  stream={audio.stream}
                  trackId={audio.trackId}
                />
              )}

              {screenShare.videoTrack && (
                <VideoPlayer stream={screenShare.stream} />
              )}

              {screenShare.audioTrack && (
                <AudioVisualizer
                  trackId={screenShare.audioTrack.id}
                  stream={screenShare.stream}
                />
              )}
            </div>
          </div>

          <div>
            <h3>Streaming:</h3>

            <div className="flex max-w-[500px] flex-col gap-2">
              {localTracks.map(({ trackId, stream, track }) => (
                <div key={trackId} className="max-w-[500px] border">
                  <span>trackId: {trackId}</span>

                  {track?.kind === "audio" && (
                    <AudioVisualizer trackId={track.id} stream={stream} />
                  )}

                  {track?.kind === "video" && (
                    <VideoPlayer key={trackId} stream={stream} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainControls;

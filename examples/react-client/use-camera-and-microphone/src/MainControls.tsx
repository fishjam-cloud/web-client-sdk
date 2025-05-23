import type { Track } from "@fishjam-cloud/react-client";
import {
  useCamera,
  useConnection,
  useInitializeDevices,
  useMicrophone,
  usePeers,
  useScreenShare,
} from "@fishjam-cloud/react-client";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";

import AudioVisualizer from "./AudioVisualizer";
import { Badge } from "./Badge";
import { DeviceSelector } from "./DeviceSelector";
import { Radio } from "./Radio";
import { ScreenShareControls } from "./ScreenShareControls";
import { ThreeStateRadio } from "./ThreeStateRadio";
import VideoPlayer from "./VideoPlayer";

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

  const { joinRoom, leaveRoom, peerStatus } = useConnection();

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
            onClick={() => {
              initializeDevices();
            }}
          >
            Init device manager
          </button>

          <button
            className="btn btn-success btn-sm"
            disabled={token === "" || peerStatus === "connected"}
            onClick={() => {
              if (!token || token === "") throw Error("Token is empty");
              joinRoom({
                url: FISHJAM_URL,
                peerToken: token,
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
              leaveRoom();

              joinRoom({
                url: FISHJAM_URL,
                peerToken: token,
              });
            }}
          >
            Reconnect
          </button>

          <button
            className="btn btn-error btn-sm"
            disabled={peerStatus !== "connected"}
            onClick={() => {
              leaveRoom();
            }}
          >
            Disconnect
          </button>
        </div>

        <div className="flex w-full flex-row flex-wrap items-center gap-2">
          <Badge status={peerStatus} />
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
          activeDevice={video.activeCamera?.label ?? null}
          devices={video.cameraDevices}
          setInput={(deviceId) => {
            if (!deviceId) return;
            video.selectCamera(deviceId);
          }}
          defaultOptionText="Select video device"
          toggle={() => {
            video.toggleCamera();
          }}
        />

        <DeviceSelector
          name="Audio"
          activeDevice={audio.activeMicrophone?.label ?? null}
          devices={audio.microphoneDevices || null}
          setInput={(deviceId) => {
            if (!deviceId) return;
            audio.selectMicrophone(deviceId);
          }}
          defaultOptionText="Select audio device"
          toggle={() => {
            audio.toggleMicrophone();
          }}
        />

        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-2">
            <button
              className="btn btn-success btn-sm"
              onClick={() => {
                video.toggleCamera();
              }}
            >
              Toggle camera (it's now {video.isCameraOn ? "on" : "off"})
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <button
              className="btn btn-success btn-sm"
              onClick={() => {
                audio.toggleMicrophone();
              }}
            >
              Toggle camera (it's now {audio.isMicrophoneOn ? "on" : "off"})
            </button>

            <button
              className="btn btn-success btn-sm"
              onClick={() => {
                audio.toggleMicrophoneMute();
              }}
            >
              Toggle camera mute (it's now{" "}
              {audio.isMicrophoneMuted ? "muted" : "unmuted"})
            </button>
          </div>
          <ScreenShareControls />
        </div>
      </div>
      <div>
        <div className="prose grid grid-rows-2">
          <div>
            <h3>Local:</h3>

            <p>Video {video.activeCamera?.deviceId}</p>

            <p>Audio {audio.activeMicrophone?.deviceId}</p>

            <div className="max-w-[500px]">
              {video.cameraStream && (
                <VideoPlayer stream={video.cameraStream} />
              )}

              {audio.microphoneStream && (
                <AudioVisualizer
                  stream={audio.microphoneStream}
                  trackId={audio.activeMicrophone?.deviceId}
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

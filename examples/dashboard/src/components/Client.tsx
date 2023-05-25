import { useState } from "react";
import type { PeerMetadata, TrackMetadata } from "../jellyfish.types";
import VideoPlayer from "./VideoPlayer";
import { JsonComponent } from "./JsonComponent";
import { useLocalStorageState } from "./LogSelector";
import type { StreamInfo } from "./VideoDeviceSelector";
import { CloseButton } from "./CloseButton";

import { BadgeStatus } from "./Badge";
import { CopyToClipboardButton } from "./CopyButton";
import { create } from "@jellyfish-dev/react-client-sdk/experimental";
import { useServerSdk } from "./ServerSdkContext";
import { useLogging } from "./useLogging";
import { useConnectionToasts } from "./useConnectionToasts";
import { showToastError } from "./Toasts";

type ClientProps = {
  roomId: string;
  peerId: string;
  token: string | null;
  name: string;
  refetchIfNeeded: () => void;
  selectedVideoStream: StreamInfo | null;
  remove: (roomId: string) => void;
  setToken: (token: string) => void;
  removeToken: () => void;
};

type Disconnect = null | (() => void);

export const Client = ({
  roomId,
  peerId,
  token,
  name,
  refetchIfNeeded,
  selectedVideoStream,
  remove,
  removeToken,
  setToken,
}: ClientProps) => {
  const [client] = useState(create<PeerMetadata, TrackMetadata>());

  const connect = client.useConnect();
  const [disconnect, setDisconnect] = useState<Disconnect>(() => null);
  const fullState = client.useSelector((snapshot) => ({
    local: snapshot.local,
    remote: snapshot.remote,
    bandwidthEstimation: snapshot.bandwidthEstimation,
    status: snapshot.status,
  }));
  const api = client.useSelector((snapshot) => snapshot.connectivity.api);
  const jellyfishClient = client.useSelector((snapshot) => snapshot.connectivity.client);
  const { peerWebsocket } = useServerSdk();

  const [show, setShow] = useLocalStorageState(`show-json-${peerId}`);

  const [trackId, setTrackId] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState<string>("");

  const isThereAnyTrack =
    Object.values(fullState?.remote || {}).flatMap(({ tracks }) => Object.values(tracks)).length > 0;

  useLogging(jellyfishClient);
  useConnectionToasts(jellyfishClient);

  return (
    <div className="card w-150 bg-base-100 shadow-xl m-2 indicator">
      <CloseButton
        onClick={() => {
          remove(roomId);
          setTimeout(() => {
            refetchIfNeeded();
          }, 500);
        }}
      />
      <div className="card-body m-2">
        <h1 className="card-title">
          Client: <span className="text-xs">{peerId}</span>
          <CopyToClipboardButton text={peerId} />{" "}
        </h1>
        <BadgeStatus status={fullState?.status} />
        <div>
          <div className="flex flex-row items-center">
            Token:
            {token && (
              <button className="btn btn-sm m-2 btn-error" onClick={removeToken}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {token ? (
            <div>
              <span className="break-words text-xs">{token}</span>
              <CopyToClipboardButton text={token} />
            </div>
          ) : (
            <div>
              <input
                type="text"
                placeholder="Type here"
                className="input input-bordered w-full max-w-xs"
                onChange={(e) => {
                  setTokenInput(e.target.value);
                }}
              />
              <button className="btn btn-sm m-2 btn-success" onClick={() => setToken(tokenInput)}>
                Save token
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-row justify-between">
          <div className="flex flex-row flex-wrap items-start content-start">
            {disconnect ? (
              <button
                className="btn btn-sm btn-error m-2"
                onClick={() => {
                  disconnect();
                  setDisconnect(() => null);
                  setTimeout(() => {
                    refetchIfNeeded();
                  }, 500);
                }}
              >
                Disconnect
              </button>
            ) : (
              <button
                className="btn btn-sm btn-success m-2"
                disabled={!token}
                onClick={() => {
                  if (!token) {
                    showToastError("Cannot connect to Jellyfish server because token is empty");
                    return;
                  }
                  const disconnect = connect({
                    peerMetadata: { name },
                    token,
                    websocketUrl: peerWebsocket,
                  });
                  setTimeout(() => {
                    refetchIfNeeded();
                  }, 500);
                  setDisconnect(() => disconnect);
                }}
              >
                Connect
              </button>
            )}

            {trackId === null ? (
              <button
                className="btn btn-sm btn-success m-2"
                disabled={fullState.status !== "joined" || !selectedVideoStream?.stream}
                onClick={() => {
                  const track = selectedVideoStream?.stream?.getVideoTracks()?.[0];
                  const stream = selectedVideoStream?.stream;
                  if (!stream || !track) return;
                  const trackId = api?.addTrack(track, stream, {
                    type: "camera",
                    active: true,
                  });
                  if (!trackId) throw Error("Adding track error!");

                  setTrackId(trackId);
                }}
              >
                Add track
              </button>
            ) : (
              <button
                disabled={fullState.status !== "joined"}
                className="btn btn-sm btn-error m-2"
                onClick={() => {
                  if (!trackId) return;
                  api?.removeTrack(trackId);
                  setTrackId(null);
                }}
              >
                Remove track
              </button>
            )}
            <button
              className="btn btn-sm m-2"
              onClick={() => {
                setShow(!show);
              }}
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
          {Object.values(fullState.local?.tracks || {}).map(({ trackId, stream }) => (
            <div key={trackId} className="w-40">
              {stream && <VideoPlayer stream={stream} />}
            </div>
          ))}
        </div>
        {show && <JsonComponent state={fullState} />}
        {isThereAnyTrack && (
          <div>
            Remote tracks:
            {Object.values(fullState?.remote || {}).map(({ id, metadata, tracks }) => {
              return (
                <div key={id}>
                  <h4>
                    {id}: {metadata?.name}
                  </h4>
                  <div>
                    {Object.values(tracks || {}).map(({ stream, trackId }) => (
                      <VideoPlayer key={trackId} stream={stream} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

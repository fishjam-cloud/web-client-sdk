import React, { useEffect, useState } from "react";
import { createNoContextMembraneClient } from "../../../../src/externalState";
import { PeerMetadata, TrackMetadata } from "../jellifishClientSetup";
import { useMockStream } from "./UseMockStream";
import VideoPlayer from "./VideoPlayer";
import { JsonComponent } from "./JsonComponent";
import { useLocalStorageState } from "./LogSelector";

type ClientProps = {
  roomId: string;
  peerId: string;
  name: string;
  emoji: string;
  refetchIfNeeded: () => void;
};

type Disconnect = null | (() => void);

export const Client = ({
  roomId,
  peerId,
  name,
  emoji,
  refetchIfNeeded,
}: ClientProps) => {
  const [client] = useState(
    createNoContextMembraneClient<PeerMetadata, TrackMetadata>()
  );
  const connect = client.useConnect();
  const [disconnect, setDisconnect] = useState<Disconnect>(() => null);
  const fullState = client.useSelector((snapshot) => ({
    local: snapshot.local,
    remote: snapshot.remote,
    bandwidthEstimation: snapshot.bandwidthEstimation,
    status: snapshot.status,
  }));
  const api = client.useSelector((snapshot) => snapshot.connectivity.api);
  const [show, setShow] = useLocalStorageState(`show-json-${peerId}`);

  const mockStream = useMockStream(emoji);
  const [trackId, setTrackId] = useState<null | string>(null);

  useEffect(() => {
    mockStream.start();
  }, []);

  const isThereAnyTrack = Object.values(fullState?.remote || {}).flatMap(
    ({ tracks }) => Object.values(tracks)
  ).length > 0;

  return (
    <div className="card w-140 bg-base-100 shadow-xl m-1">
      <div className="card-body m-2">
        <h1 className="card-title">Client {emoji}</h1>
        <h2 className="card-title">{peerId}</h2>
        <div className="flex flex-row justify-between">
          <div className="flex flex-row flex-wrap items-start content-start">
            {disconnect ? (
              <button
                className="btn btn-sm btn-error m-1"
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
                className="btn btn-sm btn-success m-1"
                onClick={() => {
                  const disconnect = connect(
                    roomId,
                    peerId,
                    { name: name },
                    true,
                    { websocketUrl: "ws://localhost:4005/socket" }
                  );
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
                className="btn btn-sm btn-success m-1"
                disabled={fullState.status !== "connected"}
                onClick={() => {
                  const track = mockStream.stream?.getVideoTracks()?.[0];
                  const stream = mockStream.stream;
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
                disabled={fullState.status !== "connected"}
                className="btn btn-sm btn-error m-1"
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
              className="btn btn-sm m-1"
              onClick={() => {
                setShow(!show);
              }}
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
          <div className="w-40">
            {mockStream.stream && <VideoPlayer stream={mockStream.stream} />}
          </div>
        </div>
        {show && <JsonComponent state={fullState} />}
        {isThereAnyTrack &&
          <div>
            Remote tracks:
            {Object.values(fullState?.remote || {}).map(
              ({ id, metadata, tracks }) => {
                return (
                  <div key={id}>
                    <h4>
                      {id}: {metadata?.name}
                    </h4>
                    <div>
                      {Object.values(tracks || {}).map(
                        ({ stream, trackId }) => (
                          <VideoPlayer key={trackId} stream={stream} />
                        )
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        }
      </div>
    </div>
  );
};

import React, { useState } from "react";
import { useLocalStorageState } from "./LogSelector";
import { getBooleanValue } from "../../../../src/jellyfish/addLogging";
import { Peer } from "@jellyfish-dev/membrane-webrtc-js";
import { client, REFETH_ON_SUCCESS } from "./App";
import { JsonComponent } from "./JsonComponent";
import { Client } from "./Client";
import { StreamInfo } from "./VideoDeviceSelector";
import { CloseButton } from "./CloseButton";

type RoomConfig = {
  maxPeers: number;
};
export type RoomType = {
  components: any;
  config: RoomConfig;
  id: string;
  peers: any[];
};
type RoomProps = {
  roomId: string;
  initial: RoomType;
  refetchIfNeeded: () => void;
  selectedVideoStream: StreamInfo | null;
};

export const Room = ({ roomId, initial, refetchIfNeeded, selectedVideoStream }: RoomProps) => {
  const [room, setRoom] = useState<RoomType | null>(initial);
  const [show, setShow] = useLocalStorageState(`show-json-${roomId}`);

  const refetch = () => {
    client.get(roomId).then((response) => {
      console.log({ name: "refetchRoom", response });
      setRoom(response.data.data);
    });
  };

  const refetchIfNeededInner = () => {
    if (getBooleanValue(REFETH_ON_SUCCESS)) {
      refetchIfNeeded();
      refetch();
    }
  };

  return (
    <div className="flex flex-col items-start mr-4">
      <div className="flex flex-col w-full border-opacity-50 m-2">
        <div className="divider p-2">Room: {roomId}</div>
      </div>

      <div className="flex flex-row items-start">
        <div className="w-120 m-2 card bg-base-100 shadow-xl indicator">
          <CloseButton
            onClick={() => {
              client.remove(roomId).then((response) => {
                console.log({ name: "removeRoom", response });
                refetchIfNeededInner();
              });
            }}
          />
          <div className="card-body">
            <div className="flex flex-col">
              <div className="flex flex-row justify-between">
                <span className="font-bold">Room</span>
                <div>
                  <button
                    className="btn btn-sm btn-info mx-1 my-0"
                    onClick={() => {
                      refetch();
                    }}
                  >
                    Refetch
                  </button>
                </div>
              </div>
            </div>
            <div className="h-full">
              <div className="flex flex-row justify-start">
                <button
                  className="btn btn-sm btn-success mx-1 my-0"
                  onClick={() => {
                    client
                      .addPeer(roomId, "webrtc")
                      .then((response) => {
                        console.log({ name: "createPeer", response });
                      })
                      .then(() => {
                        refetchIfNeededInner();
                      });
                  }}
                >
                  Create peer
                </button>
                <button
                  className="btn btn-sm mx-1 my-0"
                  onClick={() => {
                    setShow(!show);
                  }}
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>

              <div className="mt-2">{show && <JsonComponent state={room} />}</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col">
          {room?.peers.map(({ id }: Peer, idx: number) => {
            return (
              <Client
                key={id}
                roomId={roomId}
                peerId={id}
                name={id}
                refetchIfNeeded={refetchIfNeededInner}
                selectedVideoStream={selectedVideoStream}
                remove={() => client.removePeer(roomId, id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

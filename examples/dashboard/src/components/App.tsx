import { ServerRoomSdk } from "../utils/ServerSdk";
import React, { useEffect, useState } from "react";
import { LogSelector, PersistentInput, useLocalStorageState } from "./LogSelector";
import { getBooleanValue } from "../../../../src/jellyfish/addLogging";
import type { RoomType } from "./Room";
import { Room } from "./Room";
import { JsonComponent } from "./JsonComponent";
import { ThemeSelector } from "./ThemeSelector";
import type { DeviceIdToStream, StreamInfo} from "./VideoDeviceSelector";
import { VideoDeviceSelector } from "./VideoDeviceSelector";


export const client = new ServerRoomSdk("http://localhost:4000");

export const REFETCH_ON_SUCCESS = "refetch on success";

export const USE_AUTH = "use auth";

export const App = () => {
  const [state, setState] = useState<RoomType[] | null>(null);
  const [showServerState, setShow] = useLocalStorageState(`show-json-fullstate`);
  const [showLogSelector, setShowLogSelector] = useLocalStorageState("showServerState-log-selector");
  const [showDeviceSelector, setShowDeviceSelector] = useLocalStorageState("showServerState-log-selector");
  // const [showCameraTest, setShowCameraTest] = useLocalStorageState("showServerState-camera-test");
  const [selectedVideoStream, setSelectedVideoStream] = useState<StreamInfo | null>(null);
  const [activeVideoStreams, setActiveVideoStreams] = useState<DeviceIdToStream | null>(null);

  const refetchAll = () => {
    client.get().then((response) => {
      setState(response.data.data);
    });
  };

  useEffect(() => {
    refetchAll();
  }, []);

  const refetchIfNeeded = () => {
    if (getBooleanValue(REFETCH_ON_SUCCESS)) {
      refetchAll();
    }
  };

  return (
    <div className="flex flex-col w-full h-full ">
      <div className="flex flex-row justify-between m-2">
        <div className="flex flex-row justify-start items-center">
          <button
            className="btn btn-sm btn-info mx-1 my-0"
            onClick={() => {
              refetchAll();
            }}
          >
            Get all
          </button>
          <button
            className="btn btn-sm btn-success mx-1 my-0"
            onClick={() => {
              client
                .create(10)
                .then((response) => {
                  console.log({ name: "createRoom", response });
                })
                .then(() => {
                  refetchIfNeeded();
                });
            }}
          >
            Create room
          </button>
          <button
            className={`btn btn-sm mx-1 my-0 ${showLogSelector ? "btn-ghost" : ""}`}
            onClick={() => {
              setShowLogSelector(!showLogSelector);
            }}
          >
            {showLogSelector ? "Hide log selector" : "Show log selector"}
          </button>

          <button
            className={`btn btn-sm mx-1 my-0 ${showDeviceSelector ? "btn-ghost" : ""}`}
            onClick={() => {
              setShowDeviceSelector(!showDeviceSelector);
            }}
          >
            {showDeviceSelector ? "Hide device selector" : "Show device selector"}
          </button>

          <button
            className={`btn btn-sm mx-1 my-0 ${showServerState ? "btn-ghost" : ""}`}
            onClick={() => {
              setShow(!showServerState);
            }}
          >
            {showServerState ? "Hide server state" : "Show server state"}
          </button>

          {/*<button*/}
          {/*  className="btn btn-sm mx-1 my-0"*/}
          {/*  onClick={() => {*/}
          {/*    setShowCameraTest(!showCameraTest);*/}
          {/*  }}*/}
          {/*>*/}
          {/*  {showCameraTest ? "Hide camera test" : "Show camera test"}*/}
          {/*</button>*/}
          <PersistentInput name={REFETCH_ON_SUCCESS} />
          <PersistentInput name={USE_AUTH} />
        </div>
        <div className="flex flex-row justify-start">
          <ThemeSelector />
        </div>
      </div>
      <div className="flex flex-row w-full h-full m-2 items-start">
        {/*{showCameraTest && <CameraTest />}*/}
        {showLogSelector && <LogSelector />}
        {showDeviceSelector && (
          <VideoDeviceSelector
            activeVideoStreams={activeVideoStreams}
            setActiveVideoStreams={setActiveVideoStreams}
            selectedVideoStream={selectedVideoStream}
            setSelectedVideoStream={setSelectedVideoStream}
          />
        )}

        {showServerState && (
          <div>
            <div className="w-[600px] m-2 card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">Server state:</h2>
                <JsonComponent state={state} />
              </div>
            </div>
          </div>
        )}
        {state?.map((room) => (
          <Room
            key={room.id}
            roomId={room.id}
            initial={room}
            refetchIfNeeded={refetchIfNeeded}
            selectedVideoStream={selectedVideoStream}
          />
        ))}
      </div>
    </div>
  );
};

export default App;

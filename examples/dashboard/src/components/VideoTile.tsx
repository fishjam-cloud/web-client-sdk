import VideoPlayer from "./VideoPlayer";
import React from "react";
import { DeviceIdToStream, StreamInfo } from "./VideoDeviceSelector";
import { getUserMedia } from "@jellyfish-dev/browser-media-utils";

type VideoTileProps = {
  deviceId: string;
  label: string;
  setActiveVideoStreams: (
    setter: ((prev: DeviceIdToStream | null) => DeviceIdToStream) | DeviceIdToStream | null
  ) => void;
  setSelectedVideoStream: (cameraId: StreamInfo | null) => void;
  selected: boolean;
  streamInfo: StreamInfo | null;
};
export const VideoTile = ({
  deviceId,
  label,
  setActiveVideoStreams,
  setSelectedVideoStream,
  selected,
  streamInfo,
}: VideoTileProps) => (
  <div className="flex flex-col card bg-base-100 shadow-xl m-2 w-60">
    <div className="card-body">
      <div>{label}</div>
      <div className="flex flex-row flex-wrap justify-between">
        <button
          type="button"
          className="btn btn-success btn-sm m-2"
          onClick={() => {
            getUserMedia(deviceId, "video").then((stream) => {
              setActiveVideoStreams((prev) => {
                return {
                  ...prev,
                  [deviceId]: {
                    stream,
                    id: deviceId,
                  },
                };
              });
            });
          }}
        >
          Start
        </button>
        <button
          type="button"
          className="btn btn-error btn-sm m-2"
          onClick={() => {
            setActiveVideoStreams((prev) => {
              setSelectedVideoStream(null);
              const mediaStreams = { ...prev };
              mediaStreams[deviceId].stream.getVideoTracks().forEach((track) => {
                track.stop();
              });
              delete mediaStreams[deviceId];
              return mediaStreams;
            });
          }}
        >
          Stop
        </button>
      </div>

      {streamInfo && (
        <div className="flex flex-col w-40 indicator">
          {selected && <span className="indicator-item badge badge-success badge-lg"></span>}
          <VideoPlayer stream={streamInfo.stream} />
          <button
            type="button"
            className="btn btn-success btn-sm m-2"
            onClick={() => {
              setSelectedVideoStream(streamInfo);
            }}
          >
            Select
          </button>
        </div>
      )}
    </div>
  </div>
);

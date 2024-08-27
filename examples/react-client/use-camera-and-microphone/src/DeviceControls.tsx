import type { PeerStatus, UserMediaAPI } from "@fishjam-cloud/react-client";
import type { TrackManager } from "@fishjam-cloud/react-client";

type DeviceControlsProps = {
  status: PeerStatus;
} & (
  | {
      device: UserMediaAPI & TrackManager;
      type: "audio";
    }
  | {
      device: UserMediaAPI & TrackManager;
      type: "video";
    }
);

export const DeviceControls = ({
  device,
  type,
  status,
}: DeviceControlsProps) => {
  const isDeviceStreaming = !!device.getCurrentTrack()?.trackId;
  return (
    <div className="flex flex-col gap-2">
      <button
        className="btn btn-success btn-sm"
        disabled={!!device?.stream}
        onClick={() => {
          device?.initialize();
        }}
      >
        Start {type} device
      </button>

      <button
        className="btn btn-error btn-sm"
        disabled={!device?.stream}
        onClick={() => {
          device?.stop();
        }}
      >
        Stop {type} device
      </button>

      <button
        className="btn btn-success btn-sm"
        disabled={!device?.stream || device?.enabled}
        onClick={() => {
          device.enableTrack();
        }}
      >
        Enable {type} track
      </button>

      <button
        className="btn btn-error btn-sm"
        disabled={!device?.enabled}
        onClick={() => {
          device?.disableTrack();
        }}
      >
        Disable {type} track
      </button>

      <button
        className="btn btn-success btn-sm"
        disabled={status !== "joined" || !device?.stream || isDeviceStreaming}
        onClick={() => {
          device?.startStreaming();
        }}
      >
        Stream {type} track
      </button>

      <button
        className="btn btn-error btn-sm"
        disabled={status !== "joined" || !device?.stream || !isDeviceStreaming}
        onClick={() => {
          device?.stopStreaming();
        }}
      >
        Stop {type} track stream
      </button>
    </div>
  );
};

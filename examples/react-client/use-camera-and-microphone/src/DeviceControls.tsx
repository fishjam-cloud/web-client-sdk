import type { PeerStatus, Device } from "@fishjam-cloud/react-client";
import type { DeviceType } from "@fishjam-cloud/react-client";

type DeviceControlsProps = {
  status: PeerStatus;
  device: Device;
  type: DeviceType;
};

export const DeviceControls = ({
  device,
  type,
  status,
}: DeviceControlsProps) => {
  return (
    <div className="flex flex-col gap-2">
      <button
        className="btn btn-success btn-sm"
        disabled={device.isStreaming}
        onClick={() => {
          device?.initialize();
        }}
      >
        Start {type} device
      </button>

      <button
        className="btn btn-error btn-sm"
        disabled={!device.isStreaming}
        onClick={() => {
          device?.stop();
        }}
      >
        Stop {type} device
      </button>

      <button
        className="btn btn-success btn-sm"
        disabled={!device.isStreaming || !device?.paused}
        onClick={() => {
          device.enableTrack();
        }}
      >
        Enable {type} track
      </button>

      <button
        className="btn btn-error btn-sm"
        disabled={!device?.paused}
        onClick={() => {
          device?.disableTrack();
        }}
      >
        Disable {type} track
      </button>

      <button
        className="btn btn-success btn-sm"
        disabled={status !== "connected" || device.isStreaming}
        onClick={() => {
          device?.startStreaming();
        }}
      >
        Stream {type} track
      </button>

      <button
        className="btn btn-error btn-sm"
        disabled={status !== "connected" || !device.isStreaming}
        onClick={() => {
          device?.stopStreaming();
        }}
      >
        Stop {type} track stream
      </button>
    </div>
  );
};

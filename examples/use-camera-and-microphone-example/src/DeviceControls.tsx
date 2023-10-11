import { PeerStatus, UseScreenshareResult } from "@jellyfish-dev/react-client-sdk";
import { UseMicrophoneResult, UseCameraResult } from "@jellyfish-dev/react-client-sdk";
import { TrackMetadata } from "./jellyfishSetup";

type DeviceControlsProps = {
  status: PeerStatus;
  metadata: TrackMetadata;
} & (
  | {
      device: UseMicrophoneResult<TrackMetadata>;
      type: "audio";
    }
  | {
      device: UseCameraResult<TrackMetadata>;
      type: "video";
    }
  | {
      device: UseScreenshareResult<TrackMetadata>;
      type: "screenshare";
    }
);

export const DeviceControls = ({ device, type, status, metadata }: DeviceControlsProps) => {
  return (
    <div className="flex flex-col gap-2">
      <button
        className="btn btn-success btn-sm"
        disabled={!!device.stream}
        onClick={() => {
          device.start();
        }}
      >
        Start {type} device
      </button>
      <button
        className="btn btn-error btn-sm"
        disabled={!device.stream}
        onClick={() => {
          device.stop();
        }}
      >
        Stop {type} device
      </button>
      <button
        className="btn btn-success btn-sm"
        disabled={!device.stream || device.enabled}
        onClick={() => {
          device.setEnable(true);
        }}
      >
        Enable {type} track
      </button>
      <button
        className="btn btn-error btn-sm"
        disabled={!device.enabled}
        onClick={() => {
          device.setEnable(false);
        }}
      >
        Disable {type} track
      </button>
      <button
        className="btn btn-success btn-sm"
        disabled={status !== "joined" || !device?.stream || !!device?.broadcast?.trackId}
        onClick={() => {
          device.addTrack(metadata);
        }}
      >
        Stream {type} track
      </button>
      <button
        className="btn btn-error btn-sm"
        disabled={status !== "joined" || !device?.stream || !device?.broadcast?.trackId}
        onClick={() => {
          device.removeTrack();
        }}
      >
        Stop {type} track stream
      </button>
    </div>
  );
};

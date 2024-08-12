import type { PeerStatus, UserMediaAPI } from "@fishjam-cloud/react-client";
import type { TrackMetadata } from "./fishjamSetup";
import type { GenericTrackManager } from "@fishjam-cloud/react-client";

type DeviceControlsProps = {
  status: PeerStatus;
  metadata: TrackMetadata;
} & (
  | {
      device: UserMediaAPI<TrackMetadata> & GenericTrackManager<TrackMetadata>;
      type: "audio";
    }
  | {
      device: UserMediaAPI<TrackMetadata> & GenericTrackManager<TrackMetadata>;
      type: "video";
    }
);

export const DeviceControls = ({
  device,
  type,
  status,
  metadata,
}: DeviceControlsProps) => {
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
          device?.cleanup();
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
        disabled={
          status !== "joined" || !device?.stream || !!device?.broadcast?.trackId
        }
        onClick={() => {
          device?.startStreaming(metadata);
        }}
      >
        Stream {type} track
      </button>

      <button
        className="btn btn-error btn-sm"
        disabled={
          status !== "joined" || !device?.stream || !device?.broadcast?.trackId
        }
        onClick={() => {
          device?.stopStreaming();
        }}
      >
        Stop {type} track stream
      </button>
    </div>
  );
};

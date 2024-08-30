import { FC } from "react";
import AudioVisualizer from "./AudioVisualizer";
import VideoPlayer from "./VideoPlayer";
import {
  Device,
  useCamera,
  useMicrophone,
  useScreenShare,
  useStatus,
} from "@fishjam-cloud/react-client";
import { Button } from "./Button";
import { BlurToggle } from "./BlurToggle";

interface DeviceSelectProps {
  device: Device;
}

const DeviceSelect: FC<DeviceSelectProps> = ({ device }) => {
  const hasJoinedRoom = useStatus() === "joined";

  const isTrackStreamed = !!device.streamedTrack;

  return (
    <div className="flex justify-between gap-4">
      <select
        className="w-full flex-shrink"
        onChange={(e) => device.initialize(e.target.value)}
      >
        {device.devices?.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>

      {isTrackStreamed ? (
        <Button
          disabled={!hasJoinedRoom}
          onClick={async () => {
            await device.stopStreaming();
          }}
        >
          Stop
        </Button>
      ) : (
        <Button
          disabled={!hasJoinedRoom}
          onClick={async () => {
            await device.startStreaming();
          }}
        >
          Stream
        </Button>
      )}
    </div>
  );
};

export function DevicePicker() {
  const camera = useCamera();
  const microphone = useMicrophone();

  const screenShare = useScreenShare();
  const hasJoinedRoom = useStatus() === "joined";

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4">
        <DeviceSelect device={camera} />

        <DeviceSelect device={microphone} />

        {screenShare.stream ? (
          <Button
            disabled={!hasJoinedRoom}
            onClick={() => screenShare.stopStreaming()}
          >
            Stop sharing
          </Button>
        ) : (
          <Button
            disabled={!hasJoinedRoom}
            onClick={() => screenShare.startStreaming()}
          >
            Share the screen
          </Button>
        )}
      </div>

      <div className="flex flex-col items-center">
        {camera.stream && (
          <VideoPlayer className="w-64" stream={camera.stream} />
        )}
        {microphone.stream && <AudioVisualizer stream={microphone.stream} />}
      </div>

      <BlurToggle />
    </section>
  );
}

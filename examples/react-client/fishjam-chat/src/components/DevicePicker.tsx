import { FC, useState } from "react";
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
  label: string;
}

const DeviceSelect: FC<DeviceSelectProps> = ({ device, label }) => {
  const hasJoinedRoom = useStatus() === "connected";
  const [loading, setLoading] = useState<boolean>(false);

  return (
    <div className="flex flex-col justify-between gap-4">
      <select
        value={device.activeDevice?.deviceId}
        disabled={loading}
        className="w-full flex-shrink"
        onChange={async (e) => {
          setLoading(true);
          try {
            await device.initialize(e.target.value);
          } finally {
            setLoading(false);
          }
        }}
      >
        {device.devices?.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>

      <div className="flex justify-between">
        {device.isStreaming ? (
          <Button
            disabled={!hasJoinedRoom}
            onClick={async () => {
              await device.stopStreaming();
            }}
          >
            Stop streaming
          </Button>
        ) : (
          <Button
            disabled={!hasJoinedRoom}
            onClick={async () => {
              await device.startStreaming();
            }}
          >
            Start streaming
          </Button>
        )}

        {device.stream ? (
          <Button
            disabled={!device.stream}
            onClick={async () => {
              await device.stop();
            }}
          >
            Stop {label}
          </Button>
        ) : (
          <Button
            disabled={!!device.stream}
            onClick={async () => {
              await device.initialize();
            }}
          >
            Start {label}
          </Button>
        )}
      </div>
      <div className="flex justify-between">
        <Button
          onClick={async () => {
            await device.toggleDevice();
          }}
          title="Stops and starts the physical device"
        >
          Toggle {label} (start/stop)
        </Button>
        <Button
          onClick={async () => {
            await device.toggleMute();
          }}
          title="Disables or enables the device. Starts the device if it is stopped"
        >
          Toggle {label} (mute/unmute)
        </Button>
      </div>
    </div>
  );
};

export function DevicePicker() {
  const camera = useCamera();
  const microphone = useMicrophone();

  const screenShare = useScreenShare();
  const hasJoinedRoom = useStatus() === "connected";

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4">
        <DeviceSelect device={camera} label="camera" />

        <DeviceSelect device={microphone} label="microphone" />

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
        {microphone.track && <AudioVisualizer track={microphone.track} />}
      </div>

      <BlurToggle />
    </section>
  );
}

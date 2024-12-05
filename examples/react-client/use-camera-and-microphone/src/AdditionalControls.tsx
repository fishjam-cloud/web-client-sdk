import {
  useCamera,
  useConnection,
  useMicrophone,
} from "@fishjam-cloud/react-client";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";

import AudioVisualizer from "./AudioVisualizer";
import { DeviceControls } from "./DeviceControls";
import VideoPlayer from "./VideoPlayer";

const showAdditionalComponentAtom = atomWithStorage(
  "show-additional-component",
  false,
);

export const AdditionalControls = () => {
  const camera = useCamera();
  const microphone = useMicrophone();
  const { peerStatus } = useConnection();

  const [show, setShow] = useAtom(showAdditionalComponentAtom);

  return (
    <div>
      <div className="flex flex-row p-2">
        <div className="m-2">Separate component</div>

        <button
          className={`btn btn-sm ${show ? "btn-info" : "btn-success"}`}
          onClick={() => {
            setShow(!show);
          }}
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>

      {show && (
        <div className="flex flex-row flex-wrap gap-2 p-2 md:grid md:grid-cols-2">
          <div className="grid grid-cols-2 gap-2">
            <DeviceControls
              device={camera}
              type={"video"}
              status={peerStatus}
            />

            <DeviceControls
              device={microphone}
              type={"audio"}
              status={peerStatus}
            />
          </div>

          <div>
            <h3>Local:</h3>

            <div className="max-w-[500px]">
              {camera.stream && <VideoPlayer stream={camera.stream} />}

              {camera.stream && (
                <AudioVisualizer
                  stream={camera.stream}
                  trackId={camera.trackId}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdditionalControls;

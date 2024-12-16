import { useCamera, useMicrophone } from "@fishjam-cloud/react-client";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";

import AudioVisualizer from "./AudioVisualizer";
import VideoPlayer from "./VideoPlayer";

const showAdditionalComponentAtom = atomWithStorage(
  "show-additional-component",
  false,
);

export const AdditionalControls = () => {
  const camera = useCamera();
  const microphone = useMicrophone();

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
            <div className="flex flex-col gap-2">
              <button
                className="btn btn-success btn-sm"
                onClick={() => {
                  camera.toggleCamera();
                }}
              >
                Toggle camera (it's now {camera.isCameraOn ? "on" : "off"})
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <button
                className="btn btn-success btn-sm"
                onClick={() => {
                  microphone.toggleMicrophone();
                }}
              >
                Toggle camera (it's now{" "}
                {microphone.isMicrophoneOn ? "on" : "off"})
              </button>

              <button
                className="btn btn-success btn-sm"
                onClick={() => {
                  microphone.toggleMicrophoneMute();
                }}
              >
                Toggle camera mute (it's now{" "}
                {microphone.isMicrophoneMuted ? "muted" : "unmuted"})
              </button>
            </div>
          </div>

          <div>
            <h3>Local:</h3>

            <div className="max-w-[500px]">
              {camera.cameraStream && (
                <VideoPlayer stream={camera.cameraStream} />
              )}

              {microphone.microphoneStream && (
                <AudioVisualizer
                  stream={microphone.microphoneStream}
                  trackId={microphone.activeMicrophone?.deviceId}
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

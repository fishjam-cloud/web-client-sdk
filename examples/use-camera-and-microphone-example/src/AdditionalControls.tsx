import {
  MANUAL_AUDIO_TRACK_METADATA,
  MANUAL_VIDEO_TRACK_METADATA,
  useCamera,
  useMicrophone,
  useStatus,
} from "./jellyfishSetup";
import { DeviceControls } from "./DeviceControls";
import { atomWithStorage } from "jotai/utils";
import { useAtom } from "jotai";
import VideoPlayer from "./VideoPlayer";
import AudioVisualizer from "./AudioVisualizer";

const showAdditionalComponentAtom = atomWithStorage("show-additional-component", false);

export const AdditionalControls = () => {
  const camera = useCamera();
  const microphone = useMicrophone();
  const status = useStatus();

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
        <div className="flex flex-row flex-wrap md:grid md:grid-cols-2 gap-2 p-2">
          <div className="grid grid-cols-2 gap-2">
            <DeviceControls device={camera} type={"video"} status={status} metadata={MANUAL_VIDEO_TRACK_METADATA} />
            <DeviceControls device={microphone} type={"audio"} status={status} metadata={MANUAL_AUDIO_TRACK_METADATA} />
          </div>
          <div>
            <h3>Local:</h3>
            <div className="max-w-[500px]">
              {camera?.track?.kind === "video" && <VideoPlayer stream={camera?.stream} />}
              {microphone?.track?.kind === "audio" && <AudioVisualizer stream={microphone?.stream} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdditionalControls;

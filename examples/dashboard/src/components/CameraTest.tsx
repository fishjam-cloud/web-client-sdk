import { useEffect, useState } from "react";
import VideoPlayer from "./VideoPlayer";
import { useLocalStorageState, useLocalStorageStateString } from "./LogSelector";
import { JsonComponent } from "./JsonComponent";
import { enumerateDevices, EnumerateDevices, useUserMediaById } from "@jellyfish-dev/jellyfish-react-client/navigator";



export const CameraTest = () => {
  const [autostartDeviceManager, setAutostartDeviceManager] = useLocalStorageState("AUTOSTART-DEVICE-MANAGER");
  const [enumerateDevicesState, setEnumerateDevicesState] = useState<EnumerateDevices | null>(null);
  const [autostartVideo, setAutostartVideo] = useLocalStorageState("AUTOSTART-VIDEO");
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [show, setShow] = useLocalStorageState("show-autostart-media-device-state");
  const [useLastSelectedDevice, setUseLastSelectedDevice] = useLocalStorageState("use-last-selected-device");
  const [lastSelectedDeviceId, setLastSelectedDeviceId] = useLocalStorageStateString("last-selected-device-id");

  useEffect(() => {
    if (!autostartVideo) return;
    setCameraId(selectedCameraId);
  }, [selectedCameraId, autostartVideo]);

  useEffect(() => {
    if (!useLastSelectedDevice || !selectedCameraId) return;
    setLastSelectedDeviceId(selectedCameraId);
  }, [selectedCameraId, setLastSelectedDeviceId, useLastSelectedDevice]);

  useEffect(() => {
    if (!useLastSelectedDevice) return;
    setSelectedCameraId(lastSelectedDeviceId);
  }, [lastSelectedDeviceId, useLastSelectedDevice]);

  const cameraState = useUserMediaById("video", cameraId);

  const enumerateAllDevices = () =>
    enumerateDevices(true, true).then((result) => {
      setEnumerateDevicesState(result);
    });

  useEffect(() => {
    if (!autostartDeviceManager) return;

    enumerateAllDevices();
  }, [autostartDeviceManager]);

  return (
    <div className={cameraState.isLoading ? "card bg-warning shadow-xl" : "card bg-base-100 shadow-xl"}>
      <div className="card-body">
        <div className="flex flex-row flex-wrap">
          <div className="form-control flex flex-row flex-wrap content-center">
            <label className="label cursor-pointer">
              <input
                className="checkbox"
                type="checkbox"
                checked={autostartDeviceManager}
                onChange={() => {
                  setAutostartDeviceManager(!autostartDeviceManager);
                }}
              />
              <span className="label-text ml-2">Autostart enumeration</span>
            </label>
          </div>
          <button type="button" className="btn btn-info btn-sm m-2" onClick={() => enumerateAllDevices()}>
            Refresh list
          </button>
          <div className="form-control flex flex-row flex-wrap content-center">
            <label className="label cursor-pointer">
              <input
                className="checkbox"
                type="checkbox"
                checked={autostartVideo}
                onChange={() => {
                  setAutostartVideo(!autostartVideo);
                }}
              />
              <span className="label-text ml-2">Autostart video</span>
            </label>
          </div>
          <div className="form-control flex flex-row flex-wrap content-center">
            <label className="label cursor-pointer">
              <input
                className="checkbox"
                type="checkbox"
                checked={useLastSelectedDevice}
                onChange={() => {
                  setUseLastSelectedDevice(!useLastSelectedDevice);
                }}
              />
              <span className="label-text ml-2">Select last selected device</span>
            </label>
          </div>
          <button
            className="btn btn-sm m-2"
            onClick={() => {
              setShow(!show);
            }}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <div className="flex flex-row">
          <div className="flex flex-col w-96">
            <h3>Camera</h3>
            <select
              className="select select-bordered w-full max-w-xs m-2"
              onChange={(event) => {
                setCameraId(null);
                setSelectedCameraId(event.target.value);
              }}
              // defaultValue={getDefaultValue(lastSelectedDeviceId, enumerateDevicesState)}
              value={selectedCameraId || "Select camera"}
            >
              <option disabled>Select camera</option>
              {enumerateDevicesState?.video.type === "OK" &&
                enumerateDevicesState.video?.devices?.map(({ deviceId, label }) => (
                  <option key={deviceId} value={deviceId}>
                    {label}
                  </option>
                ))}
            </select>
            <div className="flex flex-col">
              <div>{selectedCameraId}</div>
              <div>
                <button
                  type="button"
                  className="btn btn-success btn-sm m-2"
                  disabled={!selectedCameraId || !!cameraState.stream}
                  onClick={() => {
                    if (cameraId) {
                      cameraState.start();
                    } else {
                      setCameraId(selectedCameraId);
                    }
                  }}
                >
                  Start
                </button>
                <button
                  type="button"
                  className="btn btn-error btn-sm m-2"
                  disabled={!cameraState.stream}
                  onClick={() => {
                    cameraState.stop();
                  }}
                >
                  Stop
                </button>
                <div className="loading"></div>
              </div>
              <VideoPlayer stream={cameraState.stream} />
            </div>
          </div>
        </div>
        {show && <JsonComponent state={enumerateDevicesState} />}
      </div>
    </div>
  );
};

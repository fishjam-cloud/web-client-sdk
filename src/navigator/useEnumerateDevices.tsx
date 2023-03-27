import { useEffect, useState } from "react";
import { isAudio, isNotGranted, isVideo, prepareReturn, toMediaTrackConstraints } from "./utils";
import { DeviceReturnType } from "./types";

export type UseEnumerateDevices = {
  audio: DeviceReturnType | { type: "Loading" };
  video: DeviceReturnType | { type: "Loading" };
};

export const useEnumerateDevices = (
  video: boolean | MediaTrackConstraints,
  audio: boolean | MediaTrackConstraints
): UseEnumerateDevices | null => {
  const [state, setState] = useState<UseEnumerateDevices | null>(null);

  // TODO inline
  const enumerateDevices = async (
    videoParam: boolean | MediaTrackConstraints,
    audioParam: boolean | MediaTrackConstraints
  ) => {
    if (!navigator?.mediaDevices) throw Error("Navigator is available only in secure contexts");

    const objAudio = toMediaTrackConstraints(audioParam);
    const objVideo = toMediaTrackConstraints(videoParam);

    const booleanAudio = !!audioParam;
    const booleanVideo = !!videoParam;

    setState(() => ({
      audio: booleanAudio ? { type: "Loading" } : { type: "Not requested" },
      video: booleanVideo ? { type: "Loading" } : { type: "Not requested" },
    }));

    let mediaDeviceInfos: MediaDeviceInfo[] = await navigator.mediaDevices.enumerateDevices();

    const constraints = {
      video: booleanVideo && mediaDeviceInfos.filter(isVideo).some(isNotGranted) && objVideo,
      audio: booleanAudio && mediaDeviceInfos.filter(isAudio).some(isNotGranted) && objAudio,
    };

    let audioError: string | null = null;
    let videoError: string | null = null;

    try {
      if (constraints.audio || constraints.video) {
        const requestedDevices = await navigator.mediaDevices.getUserMedia(constraints);

        mediaDeviceInfos = await navigator.mediaDevices.enumerateDevices();

        requestedDevices.getTracks().forEach((track) => {
          track.stop();
        });
      }
    } catch (error: any) {
      // https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#exceptions
      videoError = booleanVideo ? error.name : null;
      audioError = booleanAudio ? error.name : null;
    }

    setState({
      video: prepareReturn(booleanVideo, mediaDeviceInfos.filter(isVideo), videoError),
      audio: prepareReturn(booleanAudio, mediaDeviceInfos.filter(isAudio), audioError),
    });
  };

  useEffect(() => {
    enumerateDevices(video, audio);
  }, [video, audio]);

  return state;
};

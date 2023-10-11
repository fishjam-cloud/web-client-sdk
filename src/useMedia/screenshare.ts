import { Dispatch, useCallback, useMemo } from "react";
import { State } from "../state.types";
import { Action } from "../reducer";
import { DeviceError, DeviceState } from "../useUserMedia/types";
import { parseError } from "../useUserMedia";

export interface UseScreenshareConfig {
  trackConstraints: boolean | MediaTrackConstraints;
}

export const INITIAL_STATE: UseScreenshareState = {
  screenshare: null,
};

export type UseScreenshareAction =
  | { type: "UseScreenshare-loading" }
  | {
      type: "UseScreenshare-setScreenshare";
      data: DeviceState;
    }
  | { type: "UseScreenshare-setError"; error: DeviceError | null }
  | { type: "UseScreenshare-stop" }
  | { type: "UseScreenshare-setEnable"; enabled: boolean };

export type UseScreenshare = {
  data: DeviceState | null;
  start: () => void;
  stop: () => void;
  setEnable: (value: boolean) => void;
};

export type UseScreenshareState = {
  screenshare: DeviceState | null;
};

export const screenshareReducer = (state: UseScreenshareState, action: UseScreenshareAction): UseScreenshareState => {
  const prevState = state;
  if (action.type === "UseScreenshare-loading") {
    return {
      ...prevState,
      screenshare: {
        devices: null,
        error: null,
        media: null,
        status: "Requesting",
      },
    };
  } else if (action.type === "UseScreenshare-setScreenshare") {
    return { ...prevState, screenshare: action.data };
  } else if (action.type === "UseScreenshare-setError") {
    const newScreenshare = prevState.screenshare ?? { devices: null, error: null, media: null, status: "Error" };
    newScreenshare.error = action.error;
    newScreenshare.status = "Error";
    return { ...prevState, screenshare: newScreenshare };
  } else if (action.type === "UseScreenshare-stop") {
    if (!prevState.screenshare) return prevState;
    return { ...prevState, screenshare: { ...prevState.screenshare, media: null } };
  } else if (action.type === "UseScreenshare-setEnable") {
    const media = prevState.screenshare?.media;
    if (!prevState.screenshare || !media || !media.track) return prevState;
    media.track.enabled = action.enabled;

    return {
      ...prevState,
      screenshare: { ...prevState.screenshare, media: { ...media, enabled: action.enabled } },
    };
  }
  throw Error(`Unhandled Action ${action}`);
};

export function useScreenshare<PeerMetadata, TrackMetadata>(
  state: State<PeerMetadata, TrackMetadata>,
  dispatch: Dispatch<Action<PeerMetadata, TrackMetadata>>,
  config: UseScreenshareConfig
): UseScreenshare {
  const screenshare = state.screenshare.screenshare;

  const stop = useCallback(async () => {
    for (const track of screenshare?.media?.stream?.getTracks() ?? []) {
      track.stop();
    }
    dispatch({ type: "UseScreenshare-stop" });
  }, [screenshare, dispatch]);

  const start = useCallback(async () => {
    dispatch({ type: "UseScreenshare-loading" });
    try {
      const newStream = await navigator.mediaDevices.getDisplayMedia({
        video: config.trackConstraints,
      });
      const data: DeviceState = {
        devices: null,
        error: null,
        media: {
          deviceInfo: null,
          enabled: true,
          stream: newStream,
          track: newStream?.getVideoTracks()[0] ?? null,
        },
        status: "OK",
      };
      if (data.media?.track) {
        data.media.track.onended = () => stop();
      }
      dispatch({ type: "UseScreenshare-setScreenshare", data });
    } catch (error: unknown) {
      const parsedError: DeviceError | null = parseError(error);
      dispatch({ type: "UseScreenshare-setError", error: parsedError });
    }
  }, [config.trackConstraints, dispatch, stop]);

  const setEnable = useCallback(
    (enabled: boolean) => dispatch({ type: "UseScreenshare-setEnable", enabled }),
    [dispatch]
  );

  return useMemo(
    () => ({
      data: screenshare,
      setEnable,
      start,
      stop,
    }),
    [screenshare, setEnable, start, stop]
  );
}

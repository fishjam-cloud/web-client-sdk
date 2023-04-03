import { useCallback, useEffect, useState } from "react";
import { NOOP } from "./utils";

export type UseUserMedia = {
  isError: boolean;
  stream: MediaStream | null;
  isLoading: boolean;
  start: () => void;
  stop: () => void;
  isEnabled: boolean;
  disable: () => void;
  enable: () => void;
};

const defaultState: UseUserMedia = {
  isError: false,
  stream: null,
  isLoading: false,
  start: NOOP,
  stop: NOOP,
  isEnabled: true,
  disable: NOOP,
  enable: NOOP,
};

const stopTracks = (stream: MediaStream) => {
  stream.getTracks().forEach((track) => {
    track.stop();
  });
};

export const useMedia = (getMedia: (() => Promise<MediaStream>) | null): UseUserMedia => {
  const [state, setState] = useState<UseUserMedia>(defaultState);

  const start: (getMedia: () => Promise<MediaStream>) => Promise<MediaStream> = useCallback(
    (getMedia: () => Promise<MediaStream>) => {
      const setEnable = (stream: MediaStream, status: boolean) => {
        stream?.getTracks().forEach((track: MediaStreamTrack) => {
          track.enabled = status;
        });
        setState(
          (prevState: UseUserMedia): UseUserMedia => ({
            ...prevState,
            isEnabled: status,
          })
        );
      };

      setState((prevState) => ({ ...prevState, isLoading: true }));

      return getMedia()
        .then((mediasStream) => {
          const stop = () => {
            stopTracks(mediasStream);
            setState((prevState) => ({
              ...prevState,
              stop: NOOP,
              start: () => start(getMedia),
              stream: null,
              isEnabled: false,
              disable: NOOP,
              enable: NOOP,
            }));
          };

          setState((prevState: UseUserMedia) => {
            return {
              ...prevState,
              isLoading: false,
              stream: mediasStream,
              start: NOOP,
              stop: stop,
              disable: () => setEnable(mediasStream, false),
              enable: () => setEnable(mediasStream, true),
              isEnabled: true,
            };
          });
          return mediasStream;
        })
        .catch((e) => {
          setState((prevState) => ({
            ...prevState,
            isLoading: false,
            isError: true,
            isEnabled: false,
            disable: NOOP,
            enable: NOOP,
          }));
          return Promise.reject(e);
        });
    },
    []
  );

  useEffect(() => {
    if (!getMedia) return;
    const result: Promise<MediaStream> = start(getMedia);

    return () => {
      result.then((mediaStream) => {
        stopTracks(mediaStream);
        setState((prevState) => ({
          ...prevState,
          stop: NOOP,
          start: () => start(getMedia),
          stream: null,
        }));
      });
    };
  }, [getMedia, start]);

  return state;
};

import { Type, UseUserMediaConfig } from "../useUserMedia/types";
import { Dispatch, useCallback, useEffect, useMemo, useRef } from "react";
import { useUserMediaInternal } from "../useUserMedia";
import { SimulcastConfig, TrackBandwidthLimit } from "@jellyfish-dev/ts-client-sdk";
import {
  UseCameraAndMicrophoneResult,
  UseSetupCameraAndMicrophoneConfig,
  UseSetupCameraAndMicrophoneResult,
} from "./types";
import { State } from "../state.types";
import { Action } from "../reducer";

export const useSetupCameraAndMicrophone = <PeerMetadata, TrackMetadata>(
  state: State<PeerMetadata, TrackMetadata>,
  dispatch: Dispatch<Action<PeerMetadata, TrackMetadata>>,
  config: UseSetupCameraAndMicrophoneConfig<TrackMetadata>
): UseSetupCameraAndMicrophoneResult => {
  const userMediaConfig: UseUserMediaConfig = useMemo(
    () => ({
      storage: config.storage,
      startOnMount: config.startOnMount,
      audioTrackConstraints: config.microphone.trackConstraints,
      videoTrackConstraints: config.camera.trackConstraints,
    }),
    [config]
  );

  const result = useUserMediaInternal(state.media, dispatch, userMediaConfig);

  const mediaRef = useRef(result);
  const apiRef = useRef(state.connectivity.api);

  useEffect(() => {
    mediaRef.current = result;
    apiRef.current = state.connectivity.api;
  }, [result, state.connectivity.api]);

  const videoTrackIdRef = useRef<string | null>(null);
  const audioTrackIdRef = useRef<string | null>(null);

  const addTrack = useCallback(
    (
      type: Type,
      trackMetadata?: TrackMetadata,
      simulcastConfig?: SimulcastConfig,
      maxBandwidth?: TrackBandwidthLimit
    ) => {
      if (!apiRef.current) return;

      const trackIdRef = type === "video" ? videoTrackIdRef : audioTrackIdRef;
      if (trackIdRef.current) return;

      const deviceState = mediaRef.current.data?.[type];
      if (!deviceState) return;

      const track = deviceState.media?.track;
      const stream = deviceState.media?.stream;

      if (!track || !stream) return;

      trackIdRef.current = apiRef.current.addTrack(track, stream, trackMetadata, simulcastConfig, maxBandwidth);
    },
    []
  );

  useEffect(() => {
    if (state.status !== "joined") {
      videoTrackIdRef.current = null;
      audioTrackIdRef.current = null;
    }
  }, [state.status]);

  const replaceTrack = useCallback(
    (
      type: Type,
      newTrack: MediaStreamTrack,
      stream: MediaStream,
      newTrackMetadata?: TrackMetadata
    ): Promise<boolean> => {
      if (!apiRef.current) return Promise.resolve<boolean>(false);

      const trackIdRef = type === "video" ? videoTrackIdRef : audioTrackIdRef;
      if (!trackIdRef.current) return Promise.resolve<boolean>(false);

      const deviceState = mediaRef?.current?.data?.[type];
      if (!deviceState || deviceState.status !== "OK") return Promise.resolve<boolean>(false);

      if (!newTrack || !stream) return Promise.resolve<boolean>(false);

      return apiRef.current?.replaceTrack(trackIdRef.current, newTrack, stream, newTrackMetadata);
    },
    []
  );

  useEffect(() => {
    if (state.status !== "joined") return;

    if (config.camera.autoStreaming && mediaRef.current.data?.video.status === "OK") {
      addTrack(
        "video",
        config.camera.defaultTrackMetadata,
        config.camera.defaultSimulcastConfig,
        config.camera.defaultMaxBandwidth
      );
    }

    if (config.microphone.autoStreaming && mediaRef.current.data?.audio.status === "OK") {
      addTrack("audio", config.microphone.defaultTrackMetadata, undefined, config.microphone.defaultMaxBandwidth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, config.camera.autoStreaming, config.microphone.autoStreaming, addTrack]);

  const removeTrack = useCallback((type: Type) => {
    const trackIdRef = type === "video" ? videoTrackIdRef : audioTrackIdRef;
    if (!trackIdRef.current || !apiRef.current) return;
    apiRef.current.removeTrack(trackIdRef.current);
    trackIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!apiRef.current) return;
    const videoTrack = result.data?.video?.media?.track;
    const videoStream = result.data?.video?.media?.stream;

    const cameraPreview = config.camera.preview ?? true;

    if (!cameraPreview && result.data?.video.status === "OK" && result.data?.video.media?.stream) {
      addTrack(
        "video",
        config.camera.defaultTrackMetadata,
        config.camera.defaultSimulcastConfig,
        config.camera.defaultMaxBandwidth
      );
    } else if (videoTrackIdRef.current && videoTrack && videoStream) {
      // todo track metadata
      if (!videoTrackIdRef.current) return;
      replaceTrack("video", videoTrack, videoStream, undefined);
    } else if (videoTrackIdRef.current && !videoTrack && !videoStream) {
      // todo add nullify option
      removeTrack("video");
    }

    const audioTrack = result.data?.audio?.media?.track;
    const audioStream = result.data?.audio?.media?.stream;

    const microphonePreview = config.microphone.preview ?? true;

    if (!microphonePreview && result.data?.audio.status === "OK" && result.data?.audio.media?.stream) {
      addTrack("audio", config.microphone.defaultTrackMetadata, undefined, config.microphone.defaultMaxBandwidth);
    } else if (audioTrackIdRef.current && audioTrack && audioStream) {
      // todo track metadata
      if (!audioTrackIdRef.current) return;
      replaceTrack("audio", audioTrack, audioStream, undefined);
    } else if (audioTrackIdRef.current && !audioTrack && !audioStream) {
      // todo add nullify option
      removeTrack("audio");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.data?.video?.media?.deviceInfo?.deviceId, result.data?.audio?.media?.deviceInfo?.deviceId, replaceTrack]);

  const startByType = useCallback(
    (type: Type) => {
      result.start(type === "video" ? { videoDeviceId: true } : { audioDeviceId: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result.start]
  );

  const video = useMemo(
    () => (videoTrackIdRef.current && state.local?.tracks ? state.local?.tracks[videoTrackIdRef.current] : null),
    [state]
  );

  const audio = useMemo(
    () => (!audioTrackIdRef.current || !state.local?.tracks ? null : state.local?.tracks[audioTrackIdRef.current]),
    [state]
  );

  useEffect(() => {
    const payload: UseCameraAndMicrophoneResult<TrackMetadata> = {
      init: result.init,
      start: result.start,
      camera: {
        stop: () => {
          result.stop("video");
        },
        setEnable: (value: boolean) => result.setEnable("video", value),
        start: () => startByType("video"),
        addTrack: (
          trackMetadata?: TrackMetadata,
          simulcastConfig?: SimulcastConfig,
          maxBandwidth?: TrackBandwidthLimit
        ) => {
          console.log("Whats going on!");
          addTrack("video", trackMetadata, simulcastConfig, maxBandwidth);
        },
        removeTrack: () => removeTrack("video"),
        replaceTrack: (newTrack: MediaStreamTrack, stream: MediaStream, newTrackMetadata?: TrackMetadata) =>
          replaceTrack("video", newTrack, stream, newTrackMetadata),
        broadcast: video,
        status: result.data?.video?.status || null,
        stream: result.data?.video.media?.stream || null,
        track: result.data?.video.media?.track || null,
        enabled: result.data?.video.media?.enabled || false,
        deviceInfo: result.data?.video.media?.deviceInfo || null,
        error: result.data?.video?.error || null,
        devices: result.data?.video?.devices || null,
      },
      microphone: {
        stop: () => result.stop("audio"),
        setEnable: (value: boolean) => result.setEnable("audio", value),
        start: () => startByType("audio"),
        addTrack: (trackMetadata?: TrackMetadata, maxBandwidth?: TrackBandwidthLimit) =>
          addTrack("audio", trackMetadata, undefined, maxBandwidth),
        removeTrack: () => removeTrack("audio"),
        replaceTrack: (newTrack: MediaStreamTrack, stream: MediaStream, newTrackMetadata?: TrackMetadata) =>
          replaceTrack("audio", newTrack, stream, newTrackMetadata),
        broadcast: audio,
        status: result.data?.audio?.status || null,
        stream: result.data?.audio.media?.stream || null,
        track: result.data?.audio.media?.track || null,
        enabled: result.data?.audio.media?.enabled || false,
        deviceInfo: result.data?.audio.media?.deviceInfo || null,
        error: result.data?.audio?.error || null,
        devices: result.data?.audio?.devices || null,
      },
    };

    dispatch({ type: "setDevices", data: payload });
  }, [result, video, audio, startByType, addTrack, removeTrack, replaceTrack, dispatch]);

  return useMemo(
    () => ({
      init: result.init,
      start: result.start,
    }),
    [result]
  );
};

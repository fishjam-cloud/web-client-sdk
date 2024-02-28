import { DeviceState, Type, UseUserMediaConfig } from "../useUserMedia/types";
import { Dispatch, MutableRefObject, useCallback, useEffect, useMemo, useRef } from "react";
import { useUserMediaInternal } from "../useUserMedia";
import { SimulcastConfig, TrackBandwidthLimit } from "@jellyfish-dev/ts-client-sdk";
import { UseCameraAndMicrophoneResult, UseSetupMediaConfig, UseSetupMediaResult } from "./types";
import { State } from "../state.types";
import { Action } from "../reducer";
import { useScreenshare } from "./screenshare";

export const useSetupMedia = <PeerMetadata, TrackMetadata>(
  state: State<PeerMetadata, TrackMetadata>,
  dispatch: Dispatch<Action<PeerMetadata, TrackMetadata>>,
  config: UseSetupMediaConfig<TrackMetadata>,
): UseSetupMediaResult => {
  const userMediaConfig: UseUserMediaConfig = useMemo(
    () => ({
      storage: config.storage,
      startOnMount: config.startOnMount,
      audioTrackConstraints: config.microphone.trackConstraints,
      videoTrackConstraints: config.camera.trackConstraints,
    }),
    [config],
  );

  const result = useUserMediaInternal(state.media, dispatch, userMediaConfig);
  const screenshareResult = useScreenshare(state, dispatch, { trackConstraints: config.screenshare.trackConstraints });

  const mediaRef = useRef(result);
  const screenshareMediaRef = useRef(screenshareResult);
  const apiRef = useRef(state.connectivity.api);

  useEffect(() => {
    mediaRef.current = result;
    screenshareMediaRef.current = screenshareResult;
    apiRef.current = state.connectivity.api;
  }, [result, screenshareResult, state.connectivity.api]);

  const videoTrackIdRef = useRef<string | null>(null);
  const audioTrackIdRef = useRef<string | null>(null);
  const screenshareTrackIdRef = useRef<string | null>(null);

  const getDeviceState: (type: Type) => DeviceState | null | undefined = useCallback(
    (type) => (type === "screenshare" ? screenshareMediaRef.current.data : mediaRef.current.data?.[type]),
    [],
  );
  const getTrackIdRef: (type: Type) => MutableRefObject<string | null> = useCallback(
    (type) => (type === "screenshare" ? screenshareTrackIdRef : type === "video" ? videoTrackIdRef : audioTrackIdRef),
    [],
  );

  const addTrack = useCallback(
    async (
      type: Type,
      trackMetadata?: TrackMetadata,
      simulcastConfig?: SimulcastConfig,
      maxBandwidth?: TrackBandwidthLimit,
    ) => {
      if (!apiRef.current) return Promise.reject();

      const trackIdRef = getTrackIdRef(type);
      if (trackIdRef.current) return Promise.reject();

      const deviceState = getDeviceState(type);
      if (!deviceState) return Promise.reject();

      const track = deviceState.media?.track;
      const stream = deviceState.media?.stream;

      if (!track || !stream) return Promise.reject();

      const trackId = await apiRef.current.addTrack(track, stream, trackMetadata, simulcastConfig, maxBandwidth);
      trackIdRef.current = trackId;
      return trackId;
    },
    [getTrackIdRef, getDeviceState],
  );

  useEffect(() => {
    if (state.status !== "joined") {
      videoTrackIdRef.current = null;
      audioTrackIdRef.current = null;
      screenshareTrackIdRef.current = null;
    }
  }, [state.status]);

  const replaceTrack = useCallback(
    (type: Type, newTrack: MediaStreamTrack, stream: MediaStream, newTrackMetadata?: TrackMetadata): Promise<void> => {
      if (!apiRef.current) return Promise.reject();

      const trackIdRef = getTrackIdRef(type);
      if (!trackIdRef.current) return Promise.resolve();

      const deviceState = getDeviceState(type);
      if (!deviceState || deviceState.status !== "OK") return Promise.reject();

      if (!newTrack || !stream) return Promise.reject();

      return apiRef.current?.replaceTrack(trackIdRef.current, newTrack, stream, newTrackMetadata);
    },
    [getTrackIdRef, getDeviceState],
  );

  useEffect(() => {
    if (state.status !== "joined") return;

    if (config.camera.autoStreaming && mediaRef.current.data?.video.status === "OK") {
      addTrack(
        "video",
        config.camera.defaultTrackMetadata,
        config.camera.defaultSimulcastConfig,
        config.camera.defaultMaxBandwidth,
      );
    }

    if (config.microphone.autoStreaming && mediaRef.current.data?.audio.status === "OK") {
      addTrack("audio", config.microphone.defaultTrackMetadata, undefined, config.microphone.defaultMaxBandwidth);
    }

    if (config.screenshare.autoStreaming && screenshareMediaRef.current.data?.status === "OK") {
      addTrack(
        "screenshare",
        config.screenshare.defaultTrackMetadata,
        undefined,
        config.screenshare.defaultMaxBandwidth,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.status,
    config.camera.autoStreaming,
    config.microphone.autoStreaming,
    config.screenshare.autoStreaming,
    addTrack,
  ]);

  const removeTrack = useCallback(
    async (type: Type) => {
      const trackIdRef = getTrackIdRef(type);
      if (!trackIdRef.current || !apiRef.current) return;
      await apiRef.current.removeTrack(trackIdRef.current);
      trackIdRef.current = null;
    },
    [getTrackIdRef],
  );

  useEffect(() => {
    if (!apiRef.current) return;
    const videoTrack = result.data?.video.media?.track;
    const videoStream = result.data?.video.media?.stream;

    const cameraPreview = config.camera.preview ?? true;
    if (!cameraPreview && result.data?.video.status === "OK" && videoStream) {
      addTrack(
        "video",
        config.camera.defaultTrackMetadata,
        config.camera.defaultSimulcastConfig,
        config.camera.defaultMaxBandwidth,
      );
    } else if (videoTrackIdRef.current && videoTrack && videoStream) {
      // todo track metadata
      if (!videoTrackIdRef.current) return;
      replaceTrack("video", videoTrack, videoStream, undefined);
    } else if (videoTrackIdRef.current && !videoTrack && !videoStream) {
      // todo add nullify option
      removeTrack("video");
    }

    const audioTrack = result.data?.audio.media?.track;
    const audioStream = result.data?.audio.media?.stream;

    const microphonePreview = config.microphone.preview ?? true;

    if (!microphonePreview && result.data?.audio.status === "OK" && audioStream) {
      addTrack("audio", config.microphone.defaultTrackMetadata, undefined, config.microphone.defaultMaxBandwidth);
    } else if (audioTrackIdRef.current && audioTrack && audioStream) {
      // todo track metadata
      if (!audioTrackIdRef.current) return;
      replaceTrack("audio", audioTrack, audioStream, undefined);
    } else if (audioTrackIdRef.current && !audioTrack && !audioStream) {
      // todo add nullify option
      removeTrack("audio");
    }

    const screenshareTrack = screenshareResult.data?.media?.track;
    const screenshareStream = screenshareResult.data?.media?.stream;

    const screensharePreview = config.screenshare.preview ?? true;

    if (!screensharePreview && screenshareResult.data?.status === "OK" && screenshareStream) {
      addTrack(
        "screenshare",
        config.screenshare.defaultTrackMetadata,
        undefined,
        config.screenshare.defaultMaxBandwidth,
      );
    } else if (screenshareTrackIdRef.current && screenshareTrack && screenshareStream) {
      // todo track metadata
      if (!screenshareTrackIdRef.current) return;
      replaceTrack("screenshare", screenshareTrack, screenshareStream, undefined);
    } else if (screenshareTrackIdRef.current && !screenshareTrack && !screenshareStream) {
      // todo add nullify option
      removeTrack("screenshare");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    result.data?.video?.media?.deviceInfo?.deviceId,
    result.data?.audio?.media?.deviceInfo?.deviceId,
    screenshareResult.data?.media?.track,
    replaceTrack,
  ]);

  const video = useMemo(
    () => (videoTrackIdRef.current && state.local?.tracks ? state.local?.tracks[videoTrackIdRef.current] : null),
    [state],
  );

  const audio = useMemo(
    () => (!audioTrackIdRef.current || !state.local?.tracks ? null : state.local?.tracks[audioTrackIdRef.current]),
    [state],
  );

  const screenshare = useMemo(
    () =>
      !screenshareTrackIdRef.current || !state.local?.tracks
        ? null
        : state.local?.tracks[screenshareTrackIdRef.current],
    [state],
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
        start: (deviceId?: string) => {
          result.start({ videoDeviceId: deviceId ?? true });
        },
        addTrack: (
          trackMetadata?: TrackMetadata,
          simulcastConfig?: SimulcastConfig,
          maxBandwidth?: TrackBandwidthLimit,
        ) => {
          return addTrack("video", trackMetadata, simulcastConfig, maxBandwidth);
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
        start: (deviceId?: string) => {
          result.start({ audioDeviceId: deviceId ?? true });
        },
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
      screenshare: {
        stop: () => screenshareResult.stop(),
        setEnable: (value: boolean) => {
          screenshareResult.setEnable(value);
        },
        start: () => screenshareResult.start(),
        addTrack: (trackMetadata?: TrackMetadata, maxBandwidth?: TrackBandwidthLimit) =>
          addTrack("screenshare", trackMetadata, undefined, maxBandwidth),
        removeTrack: () => removeTrack("screenshare"),
        replaceTrack: (newTrack: MediaStreamTrack, stream: MediaStream, newTrackMetadata?: TrackMetadata) =>
          replaceTrack("screenshare", newTrack, stream, newTrackMetadata),
        broadcast: screenshare,
        status: screenshareResult.data?.status || null,
        stream: screenshareResult.data?.media?.stream ?? null,
        track: screenshareResult.data?.media?.track ?? null,
        enabled: screenshareResult.data?.media?.enabled ?? false,
        error: screenshareResult.data?.error || null,
      },
    };

    dispatch({ type: "setDevices", data: payload });
  }, [result, screenshareResult, video, audio, screenshare, addTrack, removeTrack, replaceTrack, dispatch]);

  return useMemo(
    () => ({
      init: result.init,
    }),
    [result],
  );
};

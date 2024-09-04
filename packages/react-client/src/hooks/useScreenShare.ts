import { useCallback, useEffect } from "react";
import { getRemoteOrLocalTrack } from "../utils/track";
import type { ScreenshareApi, TracksMiddleware } from "../types";
import { useFishjamContext } from "./useFishjamContext";

const getTracks = (stream: MediaStream): [MediaStreamTrack, MediaStreamTrack | null] => {
  const video = stream.getVideoTracks()[0];
  const audio = stream.getAudioTracks()[0] ?? null;

  return [video, audio];
};

export const useScreenShare = (): ScreenshareApi => {
  const ctx = useFishjamContext();

  const [state, setState] = ctx.screenshareState;
  const { fishjamClientRef } = useFishjamContext();

  const tsClient = fishjamClientRef.current;

  const getDisplayName = () => tsClient.getLocalPeer()?.metadata?.displayName;

  const startStreaming: ScreenshareApi["startStreaming"] = async (props) => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: props?.videoConstraints ?? true,
      audio: props?.audioConstraints ?? true,
    });

    const displayName = getDisplayName();

    const [video, audio] = getTracks(stream);
    const addTrackPromises = [tsClient.addTrack(video, { displayName, type: "screenShareVideo", paused: false })];
    if (audio)
      addTrackPromises.push(tsClient.addTrack(audio, { displayName, type: "screenShareAudio", paused: false }));

    const [videoId, audioId] = await Promise.all(addTrackPromises);
    setState({ stream, trackIds: { videoId, audioId } });
  };

  const replaceTracks = async (newVideoTrack: MediaStreamTrack, newAudioTrack: MediaStreamTrack | null) => {
    if (!state?.stream) return;

    const addTrackPromises = [tsClient.replaceTrack(state.trackIds.videoId, newVideoTrack)];

    if (newAudioTrack && state.trackIds.audioId) {
      addTrackPromises.push(tsClient.replaceTrack(state.trackIds.audioId, newAudioTrack));
    }

    await Promise.all(addTrackPromises);
  };

  const setTracksMiddleware = async (middleware: TracksMiddleware | null): Promise<void> => {
    if (!state?.stream) return;

    const [videoTrack, audioTrack] = getTracks(state.stream);
    const [newVideoTrack, newAudioTrack] = middleware?.(videoTrack, audioTrack) ?? [videoTrack, audioTrack];

    await replaceTracks(newVideoTrack, newAudioTrack);
  };

  const stopStreaming: ScreenshareApi["stopStreaming"] = useCallback(async () => {
    if (!state) {
      console.warn("No stream to stop");
      return;
    }
    const [video, audio] = getTracks(state.stream);

    video.stop();
    if (audio) audio.stop();

    const client = fishjamClientRef.current;
    const removeTrackPromises = [client.removeTrack(state.trackIds.videoId)];
    if (state.trackIds.audioId) removeTrackPromises.push(client.removeTrack(state.trackIds.audioId));

    await Promise.all(removeTrackPromises);

    setState(null);
  }, [state, fishjamClientRef, setState]);

  useEffect(() => {
    if (!state) return;
    const [video, audio] = getTracks(state.stream);

    const trackEndedHandler = () => {
      stopStreaming();
    };

    video.addEventListener("ended", trackEndedHandler);
    audio?.addEventListener("ended", trackEndedHandler);

    return () => {
      video.removeEventListener("ended", trackEndedHandler);
      audio?.removeEventListener("ended", trackEndedHandler);
    };
  }, [state, stopStreaming]);

  useEffect(() => {
    const client = fishjamClientRef.current;
    const onDisconnected = () => {
      stopStreaming();
    };
    client.on("disconnected", onDisconnected);

    return () => {
      client.removeListener("disconnected", onDisconnected);
    };
  }, [stopStreaming, fishjamClientRef]);

  const stream = state?.stream ?? null;
  const [videoTrack, audioTrack] = stream ? getTracks(stream) : [null, null];

  const videoBroadcast = state ? getRemoteOrLocalTrack(tsClient, state.trackIds.videoId) : null;
  const audioBroadcast = state?.trackIds.audioId ? getRemoteOrLocalTrack(tsClient, state.trackIds.audioId) : null;

  return {
    startStreaming,
    stopStreaming,
    stream,
    videoTrack,
    audioTrack,
    videoBroadcast,
    audioBroadcast,
    setTracksMiddleware,
    currentTracksMiddleware: state?.tracksMiddleware ?? null,
  };
};

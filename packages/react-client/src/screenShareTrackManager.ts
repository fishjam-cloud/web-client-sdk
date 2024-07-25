import { FishjamClient } from "@fishjam-dev/ts-client";
import { useCallback, useEffect } from "react";
import { getRemoteOrLocalTrack } from "./utils/track";
import { ScreenshareState } from "./types";

const getTracks = (stream: MediaStream): { video: MediaStreamTrack; audio: MediaStreamTrack | null } => {
  const video = stream.getVideoTracks()[0];
  const audio = stream.getAudioTracks()[0] ?? null;

  return { video, audio };
};

export const useScreenShare = <PeerMetadata, TrackMetadata>(
  [state, setState]: [ScreenshareState, React.Dispatch<React.SetStateAction<ScreenshareState>>],
  tsClient: FishjamClient<PeerMetadata, TrackMetadata>,
) => {
  const startStreaming = async (props: { metadata?: TrackMetadata; withAudio?: boolean }) => {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: props.withAudio });
    const { video, audio } = getTracks(stream);

    const addTrackPromises = [tsClient.addTrack(video, props.metadata)];
    if (audio) addTrackPromises.push(tsClient.addTrack(audio, props.metadata));

    const [videoId, audioId] = await Promise.all(addTrackPromises);
    setState({ stream, trackIds: { videoId, audioId } });
  };

  const stopStreaming = useCallback(async () => {
    if (!state) {
      console.warn("No stream to stop");
      return;
    }
    const { video, audio } = getTracks(state.stream);

    video.stop();
    if (audio) audio.stop();

    const removeTrackPromises = [tsClient.removeTrack(state.trackIds.videoId)];
    if (state.trackIds.audioId) removeTrackPromises.push(tsClient.removeTrack(state.trackIds.audioId));

    await Promise.all(removeTrackPromises);

    setState(null);
  }, [state, tsClient]);

  useEffect(() => {
    if (!state) return;
    const { video, audio } = getTracks(state.stream);

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
    const onDisconnected = () => {
      stopStreaming();
    };
    tsClient.on("disconnected", onDisconnected);

    return () => {
      tsClient.removeListener("disconnected", onDisconnected);
    };
  }, [stopStreaming, tsClient]);

  const tracks = state ? getTracks(state.stream) : { video: null, audio: null };

  const videoTrack = tracks.video;
  const audioTrack = tracks.audio;

  const videoBroadcast = state ? getRemoteOrLocalTrack(tsClient, state.trackIds?.videoId) : null;
  const audioBroadcast = state?.trackIds?.audioId ? getRemoteOrLocalTrack(tsClient, state.trackIds.audioId) : null;

  return {
    startStreaming,
    stopStreaming,
    stream: state?.stream,
    videoTrack,
    audioTrack,
    videoBroadcast,
    audioBroadcast,
  };
};

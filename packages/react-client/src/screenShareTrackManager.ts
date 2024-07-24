import { FishjamClient } from "@fishjam-dev/ts-client";
import { useCallback, useEffect, useState } from "react";
import { getRemoteOrLocalTrack } from "./utils/track";

const getTracks = (stream: MediaStream): { video: MediaStreamTrack; audio: MediaStreamTrack | null } => {
  const video = stream.getVideoTracks()[0];
  const audio = stream.getAudioTracks()[0] ?? null;

  return { video, audio };
};

export const useScreenShare = <PeerMetadata, TrackMetadata>(tsClient: FishjamClient<PeerMetadata, TrackMetadata>) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [trackIds, setTrackIds] = useState<{ videoId: string; audioId?: string } | null>(null);

  useEffect(() => {
    if (!stream) return;
    const { video, audio } = getTracks(stream);

    const getTrackEndedHandler = (track: MediaStreamTrack) => () => {
      stream.getTrackById(track.id)?.stop();
    };

    const videoEndedHandler = getTrackEndedHandler(video);
    const audioEndedHandler = audio ? getTrackEndedHandler(audio) : null;

    video.addEventListener("ended", videoEndedHandler);
    if (audio && audioEndedHandler) {
      audio.addEventListener("ended", audioEndedHandler);
    }

    return () => {
      video.removeEventListener("ended", videoEndedHandler);
      if (audio && audioEndedHandler) {
        audio.removeEventListener("ended", audioEndedHandler);
      }
    };
  }, [stream]);

  const startStreaming = async (props: { metadata: TrackMetadata; withAudio?: boolean }) => {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: props.withAudio });
    const { video, audio } = getTracks(stream);

    const addTrackPromises = [tsClient.addTrack(video, props.metadata)];
    if (audio) addTrackPromises.push(tsClient.addTrack(audio, props.metadata));

    const [videoId, audioId] = await Promise.all(addTrackPromises);

    setStream(stream);
    setTrackIds({ videoId, audioId });
  };

  const stopStreaming = useCallback(async () => {
    if (!stream || !trackIds) {
      console.warn("No stream to stop");
      return;
    }
    const { video, audio } = getTracks(stream);

    video.stop();
    if (audio) audio.stop();

    const removeTrackPromises = [tsClient.removeTrack(trackIds.videoId)];
    if (trackIds.audioId) removeTrackPromises.push(tsClient.removeTrack(trackIds.audioId));

    await Promise.all(removeTrackPromises);

    setStream(null);
    setTrackIds(null);
  }, [stream, trackIds, tsClient]);

  useEffect(() => {
    const onDisconnected = () => {
      stopStreaming();
    };
    tsClient.on("disconnected", onDisconnected);

    return () => {
      tsClient.removeListener("disconnected", onDisconnected);
    };
  }, [stopStreaming, tsClient]);

  const tracks = stream ? getTracks(stream) : { video: null, audio: null };

  const videoTrack = tracks.video;
  const audioTrack = tracks.audio;

  const videoBroadcast = trackIds ? getRemoteOrLocalTrack(tsClient, trackIds?.videoId) : null;
  const audioBroadcast = trackIds?.audioId ? getRemoteOrLocalTrack(tsClient, trackIds.audioId) : null;

  return { startStreaming, stopStreaming, stream, videoTrack, audioTrack, videoBroadcast, audioBroadcast };
};

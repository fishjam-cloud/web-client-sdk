import type { FishjamClient } from "@fishjam-cloud/ts-client";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ScreenShareState } from "../../types/internal";
import type { PeerStatus, TracksMiddleware } from "../../types/public";
import { getRemoteOrLocalTrack } from "../../utils/track";
import type { UseScreenshareResult } from "../useScreenShare";

interface ScreenShareManagerProps {
  fishjamClient: FishjamClient;
  getCurrentPeerStatus: () => PeerStatus;
}

export const useScreenShareManager = ({
  fishjamClient,
  getCurrentPeerStatus,
}: ScreenShareManagerProps): UseScreenshareResult => {
  const [state, setState] = useState<ScreenShareState>({ stream: null, trackIds: null });

  const cleanMiddlewareFnRef = useRef<(() => void) | null>(null);

  const stream = state.stream ?? null;
  const [mediaVideoTrack, mediaAudioTrack] = stream ? getTracksFromStream(stream) : [null, null];

  const getDisplayName = () => {
    const name = fishjamClient.getLocalPeer()?.metadata?.peer?.displayName;
    if (typeof name === "string") return name;
  };

  const startStreaming: UseScreenshareResult["startStreaming"] = async (props) => {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: props?.videoConstraints ?? true,
      audio: props?.audioConstraints ?? true,
    });

    const displayName = getDisplayName();

    let [video, audio] = getTracksFromStream(displayStream);

    if (state.tracksMiddleware) {
      const { videoTrack, audioTrack, onClear } = state.tracksMiddleware(video, audio);
      video = videoTrack;
      audio = audioTrack;
      cleanMiddlewareFnRef.current = onClear;
    }

    const addTrackPromises = [fishjamClient.addTrack(video, { displayName, type: "screenShareVideo", paused: false })];
    if (audio)
      addTrackPromises.push(fishjamClient.addTrack(audio, { displayName, type: "screenShareAudio", paused: false }));

    const [videoId, audioId] = await Promise.all(addTrackPromises);
    setState({ stream: displayStream, trackIds: { videoId, audioId } });
  };

  const replaceTracks = async (newVideoTrack: MediaStreamTrack, newAudioTrack: MediaStreamTrack | null) => {
    if (!state?.stream) return;

    const addTrackPromises = [fishjamClient.replaceTrack(state.trackIds.videoId, newVideoTrack)];

    if (newAudioTrack && state.trackIds.audioId) {
      addTrackPromises.push(fishjamClient.replaceTrack(state.trackIds.audioId, newAudioTrack));
    }

    await Promise.all(addTrackPromises);
  };

  const cleanMiddleware = useCallback(() => {
    cleanMiddlewareFnRef.current?.();
    cleanMiddlewareFnRef.current = null;
  }, []);

  const setTracksMiddleware = async (middleware: TracksMiddleware | null): Promise<void> => {
    if (!state?.stream) return;

    const [video, audio] = getTracksFromStream(state.stream);

    cleanMiddleware();

    const { videoTrack, audioTrack, onClear } = middleware?.(video, audio) ?? {
      videoTrack: video,
      audioTrack: audio,
      onClear: null,
    };
    cleanMiddlewareFnRef.current = onClear;
    await replaceTracks(videoTrack, audioTrack);
  };

  const stopStreaming: UseScreenshareResult["stopStreaming"] = useCallback(async () => {
    if (!state.stream) {
      console.warn("No stream to stop");
      return;
    }
    const [video, audio] = getTracksFromStream(state.stream);

    video.stop();
    if (audio) audio.stop();

    if (getCurrentPeerStatus() === "connected") {
      const removeTrackPromises = [fishjamClient.removeTrack(state.trackIds.videoId)];
      if (state.trackIds.audioId) removeTrackPromises.push(fishjamClient.removeTrack(state.trackIds.audioId));

      await Promise.all(removeTrackPromises);
    }

    cleanMiddleware();
    setState(({ tracksMiddleware }) => ({ stream: null, trackIds: null, tracksMiddleware }));
  }, [state, fishjamClient, setState, cleanMiddleware, getCurrentPeerStatus]);

  useEffect(() => {
    if (!state.stream) return;
    const [video, audio] = getTracksFromStream(state.stream);

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
      if (stream) {
        stopStreaming();
      }
    };
    fishjamClient.on("disconnected", onDisconnected);

    return () => {
      fishjamClient.removeListener("disconnected", onDisconnected);
    };
  }, [stopStreaming, fishjamClient, stream]);

  const videoBroadcast = state.stream ? getRemoteOrLocalTrack(fishjamClient, state.trackIds.videoId) : null;
  const audioBroadcast = state.trackIds?.audioId ? getRemoteOrLocalTrack(fishjamClient, state.trackIds.audioId) : null;

  return {
    startStreaming,
    stopStreaming,
    stream,
    videoTrack: mediaVideoTrack,
    audioTrack: mediaAudioTrack,
    videoBroadcast,
    audioBroadcast,
    setTracksMiddleware,
    currentTracksMiddleware: state?.tracksMiddleware ?? null,
  };
};

const getTracksFromStream = (stream: MediaStream): [MediaStreamTrack, MediaStreamTrack | null] => {
  const video = stream.getVideoTracks()[0];
  const audio = stream.getAudioTracks()[0] ?? null;

  return [video, audio];
};

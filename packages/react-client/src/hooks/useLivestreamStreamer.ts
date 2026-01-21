import { LivestreamError, publishLivestream, type PublishLivestreamResult } from "@fishjam-cloud/ts-client";
import { useCallback, useRef, useState } from "react";

import { useFishjamId } from "../contexts/fishjamId";
import { buildLivestreamWhipUrl } from "../utils/fishjamUrl";

/** @category Livestream */
export type StreamerInputs =
  | {
      /** The video source to publish. e.g. `cameraStream` from {@link useCamera} or `stream` from {@link useScreenShare} */
      video: MediaStream;
      /** The audio source to publish. e.g. `microphoneStream` from {@link useMicrophone} or `stream` from {@link useScreenShare} */
      audio?: MediaStream | null;
    }
  | {
      video?: null;
      audio: MediaStream;
    };

/** @category Livestream */
export type ConnectStreamerConfig = {
  inputs: StreamerInputs;
  /** Streamer token used to authenticate with Fishjam */
  token: string;
};

/** @category Livestream */
export interface UseLivestreamStreamerResult {
  /**
   * Callback used to start publishing the selected audio and video media streams.
   *
   * @remarks
   * Calling {@link connect} multiple times will have the effect of only publishing the **last** specified inputs.
   */
  connect: (inputs: ConnectStreamerConfig, urlOverride?: string) => Promise<void>;
  /** Callback to stop publishing anything previously published with {@link connect} */
  disconnect: () => void;
  /** Any errors encountered in {@link connect} will populate this field */
  error: LivestreamError | null;
  /** Utility flag which indicates the current connection status */
  isConnected: boolean;
}

const isLivestreamError = (err: unknown): err is LivestreamError =>
  Object.values(LivestreamError).includes(err as LivestreamError);

/**
 * Hook for publishing a livestream, which can be then received with {@link useLivestreamViewer}
 * @category Livestream
 * @group Hooks
 */
export const useLivestreamStreamer = (): UseLivestreamStreamerResult => {
  const [error, setError] = useState<LivestreamError | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const fishjamId = useFishjamId();
  const resultRef = useRef<PublishLivestreamResult | null>(null);

  const disconnect = useCallback(() => {
    resultRef.current?.stopPublishing();
    resultRef.current = null;
  }, []);

  const onConnectionStateChange = useCallback(
    (pc: RTCPeerConnection) => {
      if (isConnected && pc.connectionState !== "connected") disconnect();
      setIsConnected(pc.connectionState === "connected");
    },
    [isConnected, disconnect],
  );

  const connect = useCallback(
    async ({ inputs: { video, audio }, token }: ConnectStreamerConfig, urlOverride?: string) => {
      if (resultRef.current !== null) disconnect();

      const videoTrack = video?.getVideoTracks().at(0);
      const audioTrack = audio?.getAudioTracks().at(0);
      const stream = new MediaStream([videoTrack, audioTrack].filter((v) => v != null));

      try {
        const result = await publishLivestream(stream, urlOverride ?? buildLivestreamWhipUrl(fishjamId), token, {
          onConnectionStateChange,
        });
        resultRef.current = result;
        setError(null);
      } catch (e: unknown) {
        if (isLivestreamError(e)) setError(e);
        else console.error(e);
      }
    },
    [disconnect, onConnectionStateChange, fishjamId],
  );

  return { connect, disconnect, error, isConnected };
};

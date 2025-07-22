import { LivestreamError, publishLivestream, type PublishLivestreamResult } from "@fishjam-cloud/ts-client";
import { useCallback, useRef, useState } from "react";

import { FISHJAM_WHIP_URL } from "../consts";

/** @category Livestream */
export type ConnectStreamerConfig = {
  inputs: {
    /** The video source to publish. e.g. `cameraStream` from {@link useCamera} or `stream` from {@link useScreenShare} */
    video: MediaStream;
    /** The audio source to publish. e.g. `microphoneStream` from {@link useMicrophone} or `stream` from {@link useScreenShare} */
    audio: MediaStream;
  };
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
  /** Any errors encounterd in {@link connect} will populate this field */
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
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const resultRef = useRef<PublishLivestreamResult | null>(null);

  const disconnect = useCallback(() => {
    resultRef.current?.stopPublishing();
    resultRef.current = null;
    setIsConnected(false);
  }, []);

  const connect = useCallback(
    async ({ inputs: { video, audio }, token }: ConnectStreamerConfig, urlOverride?: string) => {
      if (resultRef.current !== null) disconnect();

      const stream = new MediaStream([video.getVideoTracks()[0], audio.getAudioTracks()[0]]);
      try {
        const result = await publishLivestream(stream, urlOverride ?? FISHJAM_WHIP_URL, token);
        resultRef.current = result;
        setError(null);
        setIsConnected(true);
      } catch (e: unknown) {
        if (isLivestreamError(e)) setError(e);
      }
    },
    [disconnect],
  );

  return { connect, disconnect, error, isConnected };
};

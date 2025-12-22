import { LivestreamError, receiveLivestream, type ReceiveLivestreamResult } from "@fishjam-cloud/ts-client";
import { useCallback, useRef, useState } from "react";

import { useFishjamId } from "../contexts/fishjamId";
import { buildLivestreamWhepUrl } from "../utils/fishjamUrl";

export type ConnectViewerConfig = { token: string; streamId?: never } | { streamId: string; token?: never };

/**
 * @category Livestream
 */
export interface UseLivestreamViewerResult {
  /** The received livestream media */
  stream: MediaStream | null;
  /**
   * Callback to start receiving a livestream.
   * If the livestream is private, provide `token`.
   * If the livestream is public, provide `streamId`.
   */
  connect: (config: ConnectViewerConfig, url?: string) => Promise<void>;
  /** Callback used to disconnect from a stream previously connected to with {@link connect} */
  disconnect: () => void;
  /** Any errors encountered in {@link connect} will be present in this field. */
  error: LivestreamError | null;
  /** Utility flag which indicates the current connection status */
  isConnected: boolean;
}

const isLivestreamError = (err: unknown): err is LivestreamError =>
  Object.values(LivestreamError).includes(err as LivestreamError);

const urlFromConfig = (config: ConnectViewerConfig, baseUrl: string) => {
  if (config.streamId) return `${baseUrl}/${config.streamId}`;
  return baseUrl;
};

/**
 * Hook for receiving a published livestream.
 * @category Livestream
 * @group Hooks
 */
export const useLivestreamViewer = (): UseLivestreamViewerResult => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<LivestreamError | null>(null);
  const resultRef = useRef<ReceiveLivestreamResult | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const fishjamId = useFishjamId();

  const disconnect = useCallback(() => {
    setStream(null);
    resultRef.current?.stop();
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
    async (config: ConnectViewerConfig, url?: string) => {
      if (resultRef.current !== null) disconnect();

      try {
        const baseUrl = buildLivestreamWhepUrl(fishjamId);
        const result = await receiveLivestream(url ?? urlFromConfig(config, baseUrl), config.token, { onConnectionStateChange });
        resultRef.current = result;
        setError(null);
        setStream(result.stream);
      } catch (e: unknown) {
        if (isLivestreamError(e)) setError(e);
      }
    },
    [disconnect, onConnectionStateChange, fishjamId],
  );

  return { stream, connect, disconnect, error, isConnected };
};

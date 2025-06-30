import { LivestreamError, receiveLivestream, type ReceiveLivestreamResult } from "@fishjam-cloud/ts-client";
import { useCallback, useRef, useState } from "react";

export interface UseLivestreamResult {
  stream: MediaStream | null;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => void;
  error: LivestreamError | null;
}

const isLivestreamError = (err: unknown): err is LivestreamError =>
  Object.values(LivestreamError).includes(err as LivestreamError);

export const useLivestream = (): UseLivestreamResult => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<LivestreamError | null>(null);
  const resultRef = useRef<ReceiveLivestreamResult | null>(null);

  const connect = useCallback(async (url: string, token: string) => {
    try {
      const result = await receiveLivestream(url, token);
      resultRef.current = result;
      setStream(result.stream);
    } catch (e: unknown) {
      if (isLivestreamError(e)) {
        setError(e);
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    setStream(null);
    resultRef.current?.stop();
    resultRef.current = null;
  }, []);

  return { stream, connect, disconnect, error };
};

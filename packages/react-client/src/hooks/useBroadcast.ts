import { type BroadcastResult, consumeBroadcast } from "@fishjam-cloud/ts-client";
import { useCallback, useRef, useState } from "react";

export interface UseBroadcastResult {
  stream: MediaStream | null;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => void;
}

export const useBroadcast = (): UseBroadcastResult => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const resultRef = useRef<BroadcastResult | null>(null);

  const connect = useCallback(async (url: string, token: string) => {
    const result = await consumeBroadcast(url, token);
    resultRef.current = result;
    setStream(result.stream);
  }, []);

  const disconnect = useCallback(() => {
    setStream(null);
    resultRef.current?.stop();
    resultRef.current = null;
  }, []);

  return { stream, connect, disconnect };
};

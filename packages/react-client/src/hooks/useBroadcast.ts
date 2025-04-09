import { consumeBroadcast } from "@fishjam-cloud/ts-client";
import { useCallback, useRef, useState } from "react";

export interface UseBroadcastResult {
  stream: MediaStream | null;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => void;
}

export const useBroadcast = (): UseBroadcastResult => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const disconnectFnRef = useRef<(() => void) | null>(null);

  const connect = useCallback(async (url: string, token: string) => {
    const result = await consumeBroadcast(url, token);

    disconnectFnRef.current = () => {
      result.stop();
      setStream(null);
    };
    setStream(result.stream);
  }, []);

  const disconnect = useCallback(() => {
    disconnectFnRef.current?.();
  }, []);

  return { stream, connect, disconnect };
};

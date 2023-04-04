import { useCallback, useState } from "react";
import { createStream } from "../utils/createMockStream";

export const useMockStream = (emoji: string) => {
  const [result, setResult] = useState<{
    stop: () => void;
    stream: MediaStream;
  } | null>(null);

  const start = useCallback(() => {
    const result = createStream(emoji, "black", 24);
    setResult(result);
  }, [emoji]);

  const stop = useCallback(() => {
    result?.stop();
    setResult(null);
  }, [result]);

  return {
    start,
    stop: stop,
    stream: result?.stream,
  };
};

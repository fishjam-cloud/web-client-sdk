import { useCallback, useContext, useMemo } from "react";

import { CustomSourceContext } from "../contexts/customSource";

/**
 * This hook can register/deregister a custom MediaStream with Fishjam.
 * @group Hooks
 */
export function useCustomSource(sourceId: string) {
  const customSourceManager = useContext(CustomSourceContext);
  if (!customSourceManager) throw Error("useCustomSource must be used within FishjamProvider");

  const source = useMemo(() => customSourceManager.getSource(sourceId), [customSourceManager, sourceId]);

  const setStream = useCallback(
    async (stream: MediaStream) => {
      await customSourceManager.setStream(sourceId, stream);
    },
    [customSourceManager, sourceId],
  );

  const startStreaming = useCallback(async () => {
    await customSourceManager.startStreaming(sourceId);
  }, [customSourceManager, sourceId]);

  const stopStreaming = useCallback(async () => {
    await customSourceManager.stopStreaming(sourceId);
  }, [customSourceManager, sourceId]);

  return {
    /**
     * Associates the given stream with the custom source.
     * This stream will be sent to Fishjam after startStreaming has been called.
     */
    setStream,
    /**
     * Starts sending the stream to Fishjam.
     */
    startStreaming,
    /**
     * Stops sending the stream to Fishjam.
     */
    stopStreaming,
    /**
     * Object representing the source's current state
     */
    source,
  };
}

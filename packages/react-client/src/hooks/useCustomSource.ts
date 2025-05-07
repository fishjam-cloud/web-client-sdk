import { useCallback, useContext, useMemo } from "react";

import { CustomSourceContext } from "../contexts/customSource";

/**
 * This hook can register/deregister a custom MediaStream with Fishjam.
 * @group Hooks
 */
export function useCustomSource<T extends string>(sourceId: T) {
  const customSourceManager = useContext(CustomSourceContext);
  if (!customSourceManager) throw Error("useCustomSource must be used within FishjamProvider");

  const { setStream: managerSetStream, getSource } = customSourceManager;

  const stream = useMemo(() => getSource(sourceId)?.stream, [getSource, sourceId]);

  const setStream = useCallback(
    (newStream: MediaStream | null) => managerSetStream(sourceId, newStream),
    [managerSetStream, sourceId],
  );

  return {
    /**
     * Associates the given stream with the custom source.
     * This stream will be sent to Fishjam after startStreaming has been called.
     */
    setStream,
    /**
     * The MediaStream currently associated with the custom source
     */
    stream,
  };
}

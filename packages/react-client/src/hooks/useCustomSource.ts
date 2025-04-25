import { useCallback, useContext, useMemo } from "react";

import { CustomSourceContext } from "../contexts/customSource";
import type { CustomSource } from "../types/public";

/**
 * This hook can register/deregister a custom MediaStream with Fishjam.
 * @group Hooks
 */
export function useCustomSource<T extends string>(sourceId: T) {
  const customSourceManager = useContext(CustomSourceContext);
  if (!customSourceManager) throw Error("useCustomSource must be used within FishjamProvider");

  const { setStream: managerSetStream, getSource } = customSourceManager;

  const source: CustomSource = useMemo(() => ({ id: sourceId, ...(getSource(sourceId) ?? {}) }), [getSource, sourceId]);

  const setStream = useCallback(
    (stream: MediaStream | null) => managerSetStream(sourceId, stream),
    [managerSetStream, sourceId],
  );

  return {
    /**
     * Associates the given stream with the custom source.
     * This stream will be sent to Fishjam after startStreaming has been called.
     */
    setStream,
    /**
     * Object representing the source's current state
     */
    source,
  };
}

import { useCallback, useContext, useMemo } from "react";

import { CustomSourceContext } from "../contexts/customSource";
import type { CustomSourceTrackTypes } from "../types/internal";

/**
 * Options controlling how a custom source's tracks are published.
 * @group Hooks
 */
export type UseCustomSourceOptions = CustomSourceTrackTypes;

/**
 * This hook can register/deregister a custom MediaStream with Fishjam.
 *
 * By default a custom source's video is published as a `customVideo` track and
 * its audio as a `customAudio` track. Pass `options.videoType: 'camera'` to
 * publish the video as a regular camera track (a "virtual camera"), so every
 * receiver buckets it as the peer's camera track with no receiver-side changes.
 *
 * @param sourceId - Stable id identifying this custom source.
 * @param options - Optional track types to publish under. Defaults to
 *   `{ videoType: 'customVideo', audioType: 'customAudio' }`.
 * @group Hooks
 */
export function useCustomSource<T extends string>(sourceId: T, options?: UseCustomSourceOptions) {
  const customSourceManager = useContext(CustomSourceContext);
  if (!customSourceManager) throw Error("useCustomSource must be used within FishjamProvider");

  const { setStream: managerSetStream, getSource } = customSourceManager;

  const stream = useMemo(() => getSource(sourceId)?.stream, [getSource, sourceId]);

  const videoType = options?.videoType;
  const audioType = options?.audioType;

  const setStream = useCallback(
    (newStream: MediaStream | null) => managerSetStream(sourceId, newStream, { videoType, audioType }),
    [managerSetStream, sourceId, videoType, audioType],
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

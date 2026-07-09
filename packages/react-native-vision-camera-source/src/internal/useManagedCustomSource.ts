import { useCustomSource } from '@fishjam-cloud/react-native-client';
import type { MediaStream } from '@fishjam-cloud/react-native-webrtc';
import { useEffect, useRef } from 'react';

/**
 * Publishes `stream` under `sourceId` via the SDK's custom-source machinery: publish when the
 * stream appears, unpublish on cleanup. Must be used under `FishjamProvider`.
 */
export function useManagedCustomSource(sourceId: string, stream: MediaStream | null): void {
  const { setStream } = useCustomSource(sourceId);

  // setStream is not referentially stable across renders; going through a ref keeps the effect's
  // cleanup from unpublishing with a stale instance.
  const setStreamRef = useRef(setStream);
  setStreamRef.current = setStream;

  useEffect(() => {
    if (stream == null) {
      return;
    }
    void setStreamRef.current(stream);
    return () => {
      void setStreamRef.current(null);
    };
  }, [stream]);
}

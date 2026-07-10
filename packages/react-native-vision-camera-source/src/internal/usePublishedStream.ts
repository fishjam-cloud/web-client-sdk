import { useCustomSource } from '@fishjam-cloud/react-native-client';
import type { MediaStream } from '@fishjam-cloud/react-native-webrtc';
import { useEffect } from 'react';

/** Publishes `stream` under `sourceId` while it exists, unpublishing on change/cleanup/unmount. */
export function usePublishedStream(sourceId: string, stream: MediaStream | null): void {
  const { setStream } = useCustomSource(sourceId);
  useEffect(() => {
    if (stream == null) return;
    void setStream(stream);
    return () => {
      void setStream(null);
    };
  }, [stream, setStream]);
}

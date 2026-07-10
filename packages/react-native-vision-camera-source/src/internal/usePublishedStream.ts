import { useCustomSource } from '@fishjam-cloud/react-native-client';
import type { MediaStream } from '@fishjam-cloud/react-native-webrtc';
import { useEffect } from 'react';

/** Publishes `stream` under `sourceId` while it exists, unpublishing on change/cleanup/unmount. */
export function usePublishedStream(sourceId: string, stream: MediaStream | null): void {
  const { setStream } = useCustomSource(sourceId);
  useEffect(() => {
    if (stream == null) return;
    // Calls for one source are serialized by the manager, but setStream can still reject (e.g.
    // a track-removal failure); downgrade to a warning — an unhandled rejection here would take
    // down dev builds.
    setStream(stream).catch((cause: unknown) => {
      console.warn('usePublishedStream: publishing the stream failed', cause);
    });
    return () => {
      setStream(null).catch((cause: unknown) => {
        console.warn('usePublishedStream: unpublishing the stream failed', cause);
      });
    };
  }, [stream, setStream]);
}

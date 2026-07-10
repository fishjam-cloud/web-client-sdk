import { useCustomSource } from '@fishjam-cloud/react-native-client';
import type { MediaStream } from '@fishjam-cloud/react-native-webrtc';
import { useEffect } from 'react';

/** Publishes `stream` under `sourceId` while it exists, unpublishing on change/cleanup/unmount. */
export function usePublishedStream(sourceId: string, stream: MediaStream | null): void {
  const { setStream } = useCustomSource(sourceId);
  useEffect(() => {
    if (stream == null) return;
    // setStream can reject (e.g. two publishes racing over the same source remove the same stale
    // track IDs); downgrade to a warning — an unhandled rejection here would take down dev builds.
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

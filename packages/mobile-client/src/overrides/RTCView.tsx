import type {
  MediaStream as RNMediaStream,
  RTCVideoViewProps as OriginalRTCVideoViewProps,
} from '@fishjam-cloud/react-native-webrtc';
import { RTCView as OriginalRTCView } from '@fishjam-cloud/react-native-webrtc';
import { useMemo } from 'react';

export type RTCVideoViewProps = Omit<OriginalRTCVideoViewProps, 'streamURL'> & { mediaStream: MediaStream };

export const RTCView = (props: RTCVideoViewProps) => {
  const streamURL = useMemo(() => {
    const mediaStream = props.mediaStream as unknown as RNMediaStream;
    if (mediaStream && typeof mediaStream.toURL === 'function') {
      return mediaStream.toURL();
    } else {
      console.error(
        'RTCView: mediaStream.toURL is not a function. Make sure to use the MediaStream type from @fishjam-cloud/react-native-webrtc',
        mediaStream,
      );
      return undefined;
    }
  }, [props.mediaStream]);
  return <OriginalRTCView {...props} streamURL={streamURL} />;
};

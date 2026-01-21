import type { MediaStream as RNMediaStream } from '@fishjam-cloud/react-native-webrtc';
import { RTCPIPView as OriginalRTCPIPView, RTCView as OriginalRTCView } from '@fishjam-cloud/react-native-webrtc';
import type React from 'react';
import { useMemo } from 'react';

export type RTCVideoViewProps = Omit<React.ComponentPropsWithRef<typeof OriginalRTCView>, 'streamURL'> & {
  mediaStream: MediaStream;
};

export type RTCPIPViewProps = Omit<React.ComponentPropsWithRef<typeof OriginalRTCPIPView>, 'streamURL'> & {
  mediaStream: MediaStream;
};

const convertMediaStreamToURL = (mediaStream: MediaStream | undefined): string | undefined => {
  const rnMediaStream = mediaStream as unknown as RNMediaStream;
  if (rnMediaStream && typeof rnMediaStream.toURL === 'function') {
    return rnMediaStream.toURL();
  } else {
    console.error(
      'mediaStream.toURL is not a function. Make sure to use the MediaStream type from @fishjam-cloud/react-native-webrtc',
      rnMediaStream,
    );
    return undefined;
  }
};

export const RTCView = ({ ref, ...props }: RTCVideoViewProps) => {
  const streamURL = useMemo(() => convertMediaStreamToURL(props.mediaStream), [props.mediaStream]);
  return <OriginalRTCView {...props} ref={ref} streamURL={streamURL} />;
};

export const RTCPIPView = ({ ref, ...props }: RTCPIPViewProps) => {
  const streamURL = useMemo(() => convertMediaStreamToURL(props.mediaStream), [props.mediaStream]);
  return <OriginalRTCPIPView {...props} ref={ref} streamURL={streamURL} />;
};

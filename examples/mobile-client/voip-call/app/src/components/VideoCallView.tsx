import {
  RTCView,
  type Track,
  useCamera,
  usePeers,
} from '@fishjam-cloud/react-native-client';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandColors } from '../theme/colors';
import { Avatar } from './Avatar';

function streamOf(track: Track | null | undefined) {
  return track?.stream && !track?.metadata?.paused ? track.stream : null;
}

type VideoCallViewProps = {
  remoteName: string;
  localName: string;
};

export function VideoCallView({ remoteName, localName }: VideoCallViewProps) {
  const insets = useSafeAreaInsets();
  const { remotePeers } = usePeers();
  const { cameraStream } = useCamera();

  const primaryRemote = remotePeers[0];
  const remoteStream = streamOf(primaryRemote?.cameraTrack);
  const localStream = cameraStream;

  return (
    <View style={styles.container}>
      {remoteStream ? (
        <RTCView
          mediaStream={remoteStream}
          objectFit="cover"
          style={styles.remoteVideo}
          zOrder={0}
        />
      ) : (
        <View style={styles.remoteNoVideo}>
          <Avatar name={remoteName} size={132} />
        </View>
      )}

      <View style={[styles.pip, { top: insets.top + 12 }]}>
        {localStream ? (
          <RTCView
            mediaStream={localStream}
            style={styles.pipVideo}
            mirror
            zOrder={1}
          />
        ) : (
          <View style={styles.pipNoVideo}>
            <Avatar name={localName} size={44} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BrandColors.darkBlue100 },
  remoteVideo: { flex: 1 },
  remoteNoVideo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.darkBlue60,
  },
  pip: {
    position: 'absolute',
    right: 16,
    width: 108,
    height: 156,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: BrandColors.seaBlue60,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  pipVideo: { flex: 1 },
  pipNoVideo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

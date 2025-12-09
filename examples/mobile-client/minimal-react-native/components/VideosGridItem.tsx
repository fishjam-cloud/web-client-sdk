import { RTCView } from '@fishjam-cloud/mobile-client';
import { View, StyleSheet, Text } from 'react-native';
import { GridTrack } from '../types';
import React from 'react';

// Helper type for MediaStream with toURL method from react-native-webrtc
interface MediaStreamWithURL extends MediaStream {
  toURL(): string;
}

export const VideosGridItem = ({ peer }: { peer: GridTrack }) => {
  const streamURL = peer.track?.stream ? (peer.track.stream as MediaStreamWithURL).toURL() : null;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.video,
          { backgroundColor: peer.isLocal ? '#606619' : '#7089DB' },
        ]}>
        {streamURL ? (
          <RTCView
            streamURL={streamURL}
            objectFit="cover"
            style={styles.videoContent}
          />
        ) : (
          <View style={styles.videoContent}>
            <Text>No video</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 0.5,
  },
  video: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    borderColor: '#001A72',
    borderWidth: 1,
  },
  videoContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

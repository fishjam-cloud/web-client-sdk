/**
 * Full-bleed view of the charades composite video (host drawing over camera).
 *
 * On the host this renders the LOCAL custom track's MediaStream; on viewers
 * it renders the host's REMOTE camera track — the same pixels either way. An
 * `RTCView` with `objectFit="cover"` fills whatever container it is placed
 * in. `mirror` is false: the composite already samples the front camera in
 * display orientation, so an extra mirror would double-flip it.
 */
import {
  RTCView,
  type MediaStream,
} from '@fishjam-cloud/react-native-client';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function CharadesCanvas({
  stream,
  placeholderText = 'Starting camera…',
}: {
  stream: MediaStream | null;
  placeholderText?: string;
}) {
  return (
    <View style={styles.videoWrapper}>
      {stream ? (
        <RTCView
          mediaStream={stream}
          objectFit="cover"
          style={styles.video}
          mirror={false}
        />
      ) : (
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderText}>{placeholderText}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  videoWrapper: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
  },
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#fff',
    fontSize: 14,
  },
});

import { RTCView, usePeers } from '@fishjam-cloud/react-native-client';
import React, { useCallback, useMemo } from 'react';
import type { ListRenderItemInfo } from 'react-native';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { type GridTrack, parsePeersToTracks } from '@/utils/tracks';

import { BrandColors } from '../utils/Colors';
import NoCameraView from './NoCameraView';

const GridTrackItem = ({
  peer,
  _index,
}: {
  peer: GridTrack;
  _index: number;
}) => {
  const isSelfVideo = peer.isLocal && peer.track?.metadata?.type === 'camera';
  const isCamera = peer.track?.metadata?.type === 'camera';
  const mediaStream =
    peer.track?.stream && !peer.track?.metadata?.paused
      ? peer.track.stream
      : null;

  return (
    <View style={styles.trackContainer}>
      <View
        style={[
          styles.videoWrapper,
          {
            backgroundColor: peer.isLocal
              ? BrandColors.seaBlue60
              : BrandColors.darkBlue60,
          },
        ]}>
        {mediaStream ? (
          <RTCView
            mediaStream={mediaStream}
            objectFit="cover"
            style={styles.video}
            pip={{
              enabled: isSelfVideo,
              startAutomatically: true,
              stopAutomatically: true,
              allowsCameraInBackground: true,
            }}
            mirror={isCamera}
          />
        ) : (
          <View style={styles.noVideoContainer}>
            <Text style={styles.noVideoText}>No video</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const ListFooterComponent = () => <View style={{ height: 80 }} />;

type VideosGridProps = {
  username: string;
};

export default function VideosGrid({ username }: VideosGridProps) {
  const { localPeer, remotePeers } = usePeers();
  const videoTracks = parsePeersToTracks(localPeer, remotePeers);

  const keyExtractor = useCallback((item: GridTrack) => item.peerId, []);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<GridTrack>) => (
      <GridTrackItem peer={item} _index={index} />
    ),
    [],
  );

  const ListEmptyComponent = useMemo(
    () => <NoCameraView username={username} />,
    [username],
  );

  return (
    <FlatList<GridTrack>
      data={videoTracks}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      numColumns={2}
      contentContainerStyle={styles.contentContainerStyle}
      columnWrapperStyle={styles.columnWrapperStyle}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={ListEmptyComponent}
    />
  );
}

const styles = StyleSheet.create({
  contentContainerStyle: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  columnWrapperStyle: {
    gap: 16,
  },
  trackContainer: {
    flex: 0.5,
  },
  videoWrapper: {
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    borderColor: BrandColors.darkBlue100,
    borderWidth: 2,
  },
  video: {
    flex: 1,
  },
  noVideoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noVideoText: {
    color: BrandColors.darkBlue100,
    fontSize: 14,
  },
  userLabel: {
    position: 'absolute',
    bottom: 18,
    right: 18,
    backgroundColor: BrandColors.darkBlue20,
    borderRadius: 4,
    padding: 4,
    opacity: 0.9,
  },
});

import {
  type PeerId,
  RTCView,
  usePeers,
  useVAD,
} from '@fishjam-cloud/react-native-client';
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
          peer.isVadActive && styles.vadActiveBorder,
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

const ListFooterComponent = () => <View style={{ height: 120 }} />;

type VideosGridProps = {
  username: string;
};

export default function VideosGrid({ username }: VideosGridProps) {
  const { localPeer, remotePeers } = usePeers();

  const peerIds = useMemo(() => {
    const ids: PeerId[] = [];
    if (localPeer) ids.push(localPeer.id as PeerId);
    remotePeers.forEach((p) => ids.push(p.id as PeerId));
    return ids;
  }, [localPeer, remotePeers]);

  const vadMap = useVAD({ peerIds });

  const vadByPeerId = useMemo((): Record<string, boolean> => {
    const m: Record<string, boolean> = {};
    if (localPeer) {
      m[localPeer.id] = vadMap[localPeer.id as PeerId] ?? false;
    }
    remotePeers.forEach((p) => {
      m[p.id] = vadMap[p.id as PeerId] ?? false;
    });
    return m;
  }, [localPeer, remotePeers, vadMap]);

  const videoTracks = parsePeersToTracks(localPeer, remotePeers, vadByPeerId);

  const keyExtractor = useCallback(
    (item: GridTrack) =>
      item.track?.trackId ??
      `${item.peerId}-${item.track?.metadata?.type ?? 'no-track'}`,
    [],
  );

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
  vadActiveBorder: {
    borderColor: '#22C55E',
    borderWidth: 3,
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
});

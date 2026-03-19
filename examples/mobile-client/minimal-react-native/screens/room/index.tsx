import { useConnection, usePeers } from '@fishjam-cloud/react-native-client';
import React, { useCallback, useEffect } from 'react';
import type { ListRenderItemInfo } from 'react-native';
import { FlatList, StyleSheet, View } from 'react-native';

import { VideosGridItem } from '../../components/VideosGridItem';
import type { RootScreenProps } from '../../navigation/RootNavigation';
import type { GridTrack } from '../../types';
import { parsePeersToTracks } from '../../utils';

export type RoomScreenProps = RootScreenProps<'Room'>;

const RoomScreen = () => {
  const { leaveRoom } = useConnection();
  const { localPeer, remotePeers } = usePeers();
  const videoTracks = parsePeersToTracks(localPeer, remotePeers);

  const keyExtractor = useCallback(
    (item: GridTrack, index: number) => item.track?.trackId ?? index.toString(),
    [],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<GridTrack>) => <VideosGridItem peer={item} />,
    [],
  );

  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, [leaveRoom]);

  return (
    <View style={styles.container}>
      <FlatList
        data={videoTracks}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={styles.contentContainerStyle}
        columnWrapperStyle={styles.columnWrapperStyle}
      />
    </View>
  );
};

export default RoomScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 32,
  },
  contentContainerStyle: {
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  columnWrapperStyle: {
    gap: 16,
  },
});

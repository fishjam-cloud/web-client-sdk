import React, { useCallback, useMemo } from "react";
import {
  FlatList,
  ListRenderItemInfo,
  StyleSheet,
  View,
  Text,
} from "react-native";
import {
  RTCView,
  type Track,
  type PeerWithTracks,
  usePeers,
} from "@fishjam-cloud/mobile-client";

import NoCameraView from "./NoCameraView";
import { BrandColors } from "../utils/Colors";

export type GridTrack = {
  track: Track | null;
  peerId: string;
  isLocal: boolean;
  isVadActive: boolean;
  aspectRatio: number | null;
};

const createGridTracksFromPeer = (peer: PeerWithTracks<unknown, unknown>, isLocal: boolean): GridTrack[] => {
  const tracks: GridTrack[] = [];

  if (peer.cameraTrack) {
    tracks.push({
      track: peer.cameraTrack,
      peerId: peer.id,
      isLocal,
      isVadActive: false,
      aspectRatio: null,
    });
  }

  if (peer.screenShareVideoTrack) {
    tracks.push({
      track: peer.screenShareVideoTrack,
      peerId: peer.id,
      isLocal,
      isVadActive: false,
      aspectRatio: null,
    });
  }

  if (tracks.length === 0) {
    tracks.push({
      track: null,
      peerId: peer.id,
      isLocal,
      isVadActive: false,
      aspectRatio: null,
    });
  }

  return tracks;
};

export const parsePeersToTracks = (
  localPeer: PeerWithTracks<unknown, unknown> | null,
  remotePeers: PeerWithTracks<unknown, unknown>[],
): GridTrack[] => [
  ...(localPeer ? createGridTracksFromPeer(localPeer, true) : []),
  ...remotePeers.flatMap((peer) => createGridTracksFromPeer(peer, false)),
];


const GridTrackItem = ({ peer, index }: { peer: GridTrack; index: number }) => {
  const streamURL = peer.track?.stream ? peer.track.stream.toURL() : null;

  return (
    <View style={styles.trackContainer}>
      <View
        style={[
          styles.videoWrapper,
          { backgroundColor: peer.isLocal ? BrandColors.seaBlue60 : BrandColors.darkBlue60 },
        ]}
      >
        {streamURL ? (
          <RTCView
            streamURL={streamURL}
            objectFit="cover"
            style={styles.video}
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

export default function VideosGrid({
  username,
}: VideosGridProps) {
  const { localPeer, remotePeers } = usePeers();
  const videoTracks = parsePeersToTracks(localPeer, remotePeers);

  const keyExtractor = useCallback((item: GridTrack) => item.peerId, []);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<GridTrack>) => (
      <GridTrackItem peer={item} index={index} />
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
    overflow: "hidden",
    borderColor: BrandColors.darkBlue100,
    borderWidth: 2,
  },
  video: {
    flex: 1,
  },
  noVideoContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  noVideoText: {
    color: BrandColors.darkBlue100,
    fontSize: 14,
  },
  userLabel: {
    position: "absolute",
    bottom: 18,
    right: 18,
    backgroundColor: BrandColors.darkBlue20,
    borderRadius: 4,
    padding: 4,
    opacity: 0.9,
  },
});


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
  type PeerId,
  type PeerWithTracks,
  useConnection,
  usePeers,
} from "@fishjam-cloud/mobile-client";

import NoCameraView from "./NoCameraView";
import Typo from "./Typo";
import { BrandColors } from "../utils/Colors";

export type GridTrack = {
  track: Track | null;
  peerId: string;
  isLocal: boolean;
  isVadActive: boolean;
  aspectRatio: number | null;
};

// type PeerMetadata = {
//   displayName?: string;
// };

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

//TODO: FCE-2487 remove it when MediaStream will be updated
interface MediaStreamWithURL extends MediaStream {
  toURL(): string;
}

const GridTrackItem = ({ peer, index }: { peer: GridTrack; index: number }) => {
   //TODO: FCE-2487 overwrite Track to include MediaStream from react-native-webrtc
  const streamURL = peer.track?.stream ? (peer.track.stream as MediaStreamWithURL).toURL() : null;

  return (
    <View style={styles.trackContainer}>
      {streamURL ? (
          <RTCView
            streamURL={streamURL}
            objectFit="cover"
            style={styles.video}
          />
        ) : (
          <View style={styles.video}>
            <Text>No video</Text>
          </View>
        )}
      {/* <View style={styles.userLabel}>
        <Typo variant="label">{peer.track?.stream?.metadata?.peer?.displayName ?? "Unknown"}</Typo>
      </View> */}
    </View>
  );
};

const ListFooterComponent = () => <View style={{ height: 80 }} />;

type VideosGridProps = {
  // localPeer: PeerWithTracks<PeerMetadata> | null;
  // remotePeers: PeerWithTracks<PeerMetadata>[];
  username: string;
};

export default function VideosGrid({
  username,
}: VideosGridProps) {
  const { leaveRoom } = useConnection();
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
      contentContainerStyle={styles.contentContainerStyle}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={ListEmptyComponent}
    />
  );
}

const styles = StyleSheet.create({
  contentContainerStyle: {
    flexGrow: 1,
  },
  trackContainer: {
    flex: 1,
    justifyContent: "center",
    padding: 10,
  },
  video: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    borderColor: BrandColors.darkBlue100,
    borderWidth: 2,
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


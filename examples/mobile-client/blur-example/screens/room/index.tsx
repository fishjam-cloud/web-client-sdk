import {
  useCamera,
  useConnection,
  usePeers,
} from "@fishjam-cloud/react-native-client";
import { useBackgroundBlur } from "@fishjam-cloud/react-native-webrtc-background-blur";
import React, { useCallback, useEffect } from "react";
import {
  Button,
  FlatList,
  ListRenderItemInfo,
  StyleSheet,
  View,
} from "react-native";
import { VideosGridItem } from "../../components/VideosGridItem";
import { RootScreenProps } from "../../navigation/RootNavigation";
import { GridTrack } from "../../types";
import { parsePeersToTracks } from "../../utils";

export type RoomScreenProps = RootScreenProps<"Room">;

const RoomScreen = () => {
  const { setCameraTrackMiddleware, currentCameraMiddleware } = useCamera();
  const { leaveRoom } = useConnection();
  const { localPeer, remotePeers } = usePeers();
  const { blurMiddleware } = useBackgroundBlur();
  const videoTracks = parsePeersToTracks(localPeer, remotePeers);

  const keyExtractor = useCallback((item: GridTrack) => item.peerId, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<GridTrack>) => <VideosGridItem peer={item} />,
    [],
  );

  const isBlurEnabled = currentCameraMiddleware === blurMiddleware;

  const toggleBlur = useCallback(() => {
    if (isBlurEnabled) {
      setCameraTrackMiddleware(null);
    } else {
      setCameraTrackMiddleware(blurMiddleware);
    }
  }, [isBlurEnabled, setCameraTrackMiddleware, blurMiddleware]);

  useEffect(() => {
    return () => {
      setCameraTrackMiddleware(null);
      leaveRoom();
    };
  }, [leaveRoom, setCameraTrackMiddleware]);

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

      <Button
        title={isBlurEnabled ? "Disable Blur" : "Enable Blur"}
        onPress={toggleBlur}
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
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  columnWrapperStyle: {
    gap: 16,
  },
});

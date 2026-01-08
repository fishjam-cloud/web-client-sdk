import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import {
  useCamera,
  useMicrophone,
  useConnection,
  useScreenShare,
} from "@fishjam-cloud/mobile-client";

import { InCallButton, VideosGrid } from "../../components";

export default function RoomScreen() {
  const { userName } = useLocalSearchParams<{
    roomName: string;
    userName: string;
  }>();

  const { isCameraOn, toggleCamera, stopCamera } = useCamera();
  const { isMicrophoneOn, toggleMicrophone, stopMicrophone } = useMicrophone();
  const { leaveRoom } = useConnection();
  const [isScreenShareOn, setIsScreenShareOn] = useState(false);

  const handleDisconnect = useCallback(() => {
    try {
      leaveRoom();
    } catch (e) {
      console.log("Error leaving room:", e);
    }
    router.replace("/(tabs)/room");
  }, [leaveRoom]);

  const handleToggleScreenShare = useCallback(async () => {
    // TODO: fix when screen share will be implemented
    console.log("toggleScreenShare");
  }, []);

  useEffect(() => {
    return () => {
      try {
        leaveRoom();
      } catch (e) {
        console.log("Error leaving room:", e);
      }
      stopCamera();
      stopMicrophone();
    };
  }, [leaveRoom, stopCamera, stopMicrophone]);

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <VideosGrid username={userName ?? "You"} />

      <View style={styles.callView}>
        <InCallButton
          type="disconnect"
          iconName="phone-hangup"
          onPress={handleDisconnect}
          accessibilityLabel="Disconnect"
        />
        <InCallButton
          iconName={isMicrophoneOn ? "microphone" : "microphone-off"}
          onPress={toggleMicrophone}
          accessibilityLabel="Toggle Microphone"
        />
        <InCallButton
          iconName={isCameraOn ? "camera" : "camera-off"}
          onPress={toggleCamera}
          accessibilityLabel="Toggle Camera"
        />
        <InCallButton
          iconName={isScreenShareOn ? "monitor-share" : "monitor-off"}
          onPress={handleToggleScreenShare}
          accessibilityLabel="Toggle Screen Share"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    backgroundColor: "#F1FAFE",
  },
  callView: {
    position: "absolute",
    bottom: 30,
    flexDirection: "row",
    alignSelf: "center",
    gap: 10,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    padding: 12,
    borderRadius: 30,
  },
});

import React, { useEffect } from "react";
import { StyleSheet, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import {
  useSandbox,
  useLivestreamViewer,
  RTCView,
} from "@fishjam-cloud/mobile-client";
import { BrandColors } from "../../utils/Colors";

export default function LivestreamViewerScreen() {
  const { roomName } = useLocalSearchParams<{
    roomName: string;
  }>();

  const { getSandboxViewerToken } = useSandbox();

  const { connect, disconnect, stream, isConnected, error } =
    useLivestreamViewer();

  useEffect(() => {
    const connectToStream = async () => {
      try {
        console.log("Connecting to stream:", roomName);
        const token = await getSandboxViewerToken(roomName);
        await connect({ token });
      } catch (err) {
        console.error("Failed to connect to livestream:", err);
      }
    };

    connectToStream();

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.box}>
        {error && <Text style={styles.errorText}>Error: {error}</Text>}
        <Text style={styles.roomHeading}>{roomName}</Text>
        <View style={styles.videoView}>
          {stream ? (
            <RTCView
              style={styles.rtcView}
              streamURL={stream.toURL()}
              objectFit="contain"
            />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                {isConnected ? "Waiting for stream..." : "Connecting..."}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.statusText}>
          Status: {isConnected ? "Connected" : "Disconnected"}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1FAFE",
    padding: 24,
  },
  box: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
  videoView: {
    width: "100%",
    height: "70%",
    backgroundColor: "#E0E0E0",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BrandColors.darkBlue80,
  },
  rtcView: {
    flex: 1,
    backgroundColor: "#000",
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  placeholderText: {
    color: "#fff",
    fontSize: 16,
  },
  roomHeading: {
    fontSize: 22,
    fontWeight: "700",
    color: BrandColors.darkBlue100,
  },
  statusText: {
    fontSize: 14,
    color: BrandColors.darkBlue100,
  },
  errorText: {
    color: "red",
    fontSize: 14,
    textAlign: "center",
  },
});

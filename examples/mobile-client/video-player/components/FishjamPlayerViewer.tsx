import { View, StyleSheet, Text, ActivityIndicator } from "react-native";
import {
  useSandbox,
  useLivestreamViewer,
  RTCView,
} from "@fishjam-cloud/mobile-client";
import { useEffect } from "react";

export const FishjamPlayerViewer = ({ roomName }: { roomName: string }) => {
  const { getSandboxViewerToken } = useSandbox();
  const { connect, disconnect, stream } = useLivestreamViewer();

  useEffect(() => {
    const setup = async () => {
      const token = await getSandboxViewerToken(roomName);
      await connect({ token });
    };

    setup();

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.videoContainer}>
        {stream ? (
          <>
            <RTCView
              style={styles.video}
              mediaStream={stream}
              mirror={true}
              objectFit="cover"
            />
            <View style={styles.viewingIndicator}>
              <View style={styles.viewingDot} />
              <Text style={styles.viewingText}>WATCHING</Text>
            </View>
          </>
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loadingText}>Connecting to stream...</Text>
            <Text style={styles.roomText}>Room: {roomName}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  videoContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  viewingIndicator: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(99, 102, 241, 0.9)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  viewingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
    marginRight: 6,
  },
  viewingText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a2e",
  },
  loadingText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 20,
  },
  roomText: {
    color: "#8892b0",
    fontSize: 14,
    marginTop: 8,
  },
});

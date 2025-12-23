import React, { useCallback, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import {
  useSandbox,
  useLivestreamStreamer,
  useScreenShare,
  ScreenCapturePickerView,
} from "@fishjam-cloud/mobile-client";
import { Button } from "../../components";
import { BrandColors } from "../../utils/Colors";

export default function LivestreamScreenSharingScreen() {
  const { fishjamId, roomName } = useLocalSearchParams<{
    fishjamId: string;
    roomName: string;
  }>();

  const { getSandboxLivestream } = useSandbox({
    fishjamId: fishjamId ?? "",
  });

  const { connect, disconnect, isConnected, error } = useLivestreamStreamer();

  const {
    stream: screenStream,
    startStreaming: startScreenShare,
    stopStreaming: stopScreenShare,
    isStreaming: isScreenSharing,
  } = useScreenShare();

  const [isStarting, setIsStarting] = useState(false);

  const handleStartScreenShare = useCallback(async () => {
    try {
      setIsStarting(true);
      await startScreenShare();
    } catch (err) {
      console.error("Failed to start screen share:", err);
    } finally {
      setIsStarting(false);
    }
  }, [startScreenShare]);

  const handleConnect = useCallback(async () => {
    try {
      if (!screenStream) {
        console.error("Screen stream not available");
        return;
      }

      const { streamerToken } = await getSandboxLivestream(
        roomName ?? "",
        false,
      );
      await connect({
        inputs: {
          video: screenStream,
        },
        token: streamerToken,
      });
    } catch (err) {
      console.error("Failed to start streaming:", err);
    }
  }, [connect, getSandboxLivestream, roomName, screenStream]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    stopScreenShare();
  }, [disconnect, stopScreenShare]);

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.box}>
        {error && <Text style={styles.errorText}>Error: {error}</Text>}

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Screen sharing allows you to broadcast your device screen.
          </Text>
        </View>

        <ScreenCapturePickerView />

        {!isScreenSharing && (
          <Button
            title={isStarting ? "Starting..." : "Start Screen Capture"}
            onPress={handleStartScreenShare}
            disabled={isStarting}
          />
        )}

        {isScreenSharing && !isConnected && (
          <Button title="Start Streaming" onPress={handleConnect} />
        )}

        {isConnected && (
          <Button title="Stop Streaming" onPress={handleDisconnect} />
        )}

        <Text style={styles.statusText}>
          Screen Capture: {isScreenSharing ? "Active" : "Inactive"}
        </Text>
        <Text style={styles.statusText}>
          Streaming: {isConnected ? "Yes" : "No"}
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
  infoBox: {
    backgroundColor: BrandColors.seaBlue40,
    padding: 16,
    borderRadius: 12,
    width: "100%",
  },
  infoText: {
    fontSize: 14,
    color: BrandColors.darkBlue100,
    textAlign: "center",
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

import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import {
  useSandbox,
  useLivestreamStreamer,
  useScreenShare,
  useInitializeDevices,
} from "@fishjam-cloud/react-native-client";

import { Button } from "../../components";
import { BrandColors } from "../../utils/Colors";

export default function LivestreamScreenSharingScreen() {
  const { roomName } = useLocalSearchParams<{
    roomName: string;
    fishjamId?: string;
  }>();

  const { initializeDevices } = useInitializeDevices();
  const { getSandboxLivestream } = useSandbox();
  const { connect, disconnect, isConnected, error } = useLivestreamStreamer();
  const {
    startStreaming: startScreenCapture,
    stopStreaming: stopScreenCapture,
    stream: screenStream,
  } = useScreenShare();

  const [isStarting, setIsStarting] = useState(false);

  const handleStartScreenShare = useCallback(async () => {
    try {
      setIsStarting(true);
      await startScreenCapture();
    } catch (err) {
      console.error("Failed to start screen capture:", err);
    } finally {
      setIsStarting(false);
    }
  }, [startScreenCapture]);

  useEffect(() => {
    const connectToLivestream = async () => {
      if (screenStream && !isConnected && roomName) {
        try {
          const { streamerToken } = await getSandboxLivestream(roomName);
          await connect({
            inputs: {
              video: screenStream,
            },
            token: streamerToken,
          });
        } catch (err) {
          console.error("Failed to connect to livestream:", err);
        }
      }
    };
    connectToLivestream();
  }, [screenStream, isConnected, roomName, getSandboxLivestream, connect]);

  const handleStopScreenShare = useCallback(async () => {
    try {
      disconnect();
      await stopScreenCapture();
    } catch (err) {
      console.error("Failed to stop screen share:", err);
    }
  }, [disconnect, stopScreenCapture]);

  useEffect(() => {
    const setup = async () => {
      try {
        console.log("Initializing devices");
        await initializeDevices({ enableVideo: false, enableAudio: true });
      } catch (err) {
        console.error("Failed to initialize devices:", err);
      }
    };
    setup();

    return () => {
      (async () => {
        try {
          disconnect();
          await stopScreenCapture();
        } catch (err) {
          console.error(
            "Failed to clean up livestream resources on unmount:",
            err
          );
        }
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializeDevices, disconnect, stopScreenCapture]);

  const isScreenSharing = Boolean(screenStream) && isConnected;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.box}>
        {error && <Text style={styles.errorText}>Error: {error}</Text>}

        <Text style={styles.roomHeading}>{roomName}</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Screen sharing allows you to broadcast your device screen to
            viewers.
          </Text>
        </View>

        {!isScreenSharing ? (
          <Button
            title={isStarting ? "Starting..." : "Start Screen Capture"}
            onPress={handleStartScreenShare}
            disabled={isStarting}
          />
        ) : (
          <Button
            title="Stop Screen Capture"
            onPress={handleStopScreenShare}
            type="secondary"
          />
        )}

        <Text style={styles.statusText}>
          Status: {isScreenSharing ? "Streaming" : "Not streaming"}
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
  roomHeading: {
    fontSize: 22,
    fontWeight: "700",
    color: BrandColors.darkBlue100,
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

import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import {
  useInitializeDevices,
  useSandbox,
  useLivestreamStreamer,
  useCamera,
  useMicrophone,
  RTCView,
} from "@fishjam-cloud/mobile-client";
import { changeFishjamId } from "../../utils/fishjamIdStore";

import { Button } from "../../components";
import { BrandColors } from "../../utils/Colors";

// Helper type for MediaStream with toURL method from react-native-webrtc
interface MediaStreamWithURL extends MediaStream {
  toURL(): string;
}

export default function LivestreamStreamerScreen() {
  const { roomName } = useLocalSearchParams<{
    roomName: string;
  }>();

  const { getSandboxLivestream } = useSandbox();

  const { connect, disconnect, isConnected, error } = useLivestreamStreamer();

  const {
    cameraStream,
    startCamera,
    stopCamera,
  } = useCamera();

  const { microphoneStream, startMicrophone, stopMicrophone } =
    useMicrophone();

  const { initializeDevices } = useInitializeDevices();

  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const setup = async () => {
      try {
        changeFishjamId(process.env.EXPO_PUBLIC_FISHJAM_ID ?? "");
        await initializeDevices({ enableVideo: true, enableAudio: true });
        await startCamera();
        await startMicrophone();
        setIsInitialized(true);
      } catch (err) {
        console.error("Failed to initialize media devices:", err);
      }
    };
    setup();

    return () => {
      try {
        disconnect();
      } catch (err) {
        console.error("Failed to disconnect livestream streamer:", err);
      }
      stopCamera(); 
      stopMicrophone();
    };
    //TODO: FCE-2509 Add dependencies when startCamera gets fixed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isConnected || error) {
      setIsConnecting(false);
    }
  }, [isConnected, error]);

  const handleConnect = useCallback(async () => {
    try {
      if (isConnected || isConnecting) return;
      if (!cameraStream || !microphoneStream) {
          console.error("Camera or microphone stream not available");
          return;
      }

      setIsConnecting(true);
      const { streamerToken } = await getSandboxLivestream(roomName);
      await connect({
        inputs: {
          video: cameraStream,
          audio: microphoneStream,
        },
        token: streamerToken,
      });
    } catch (err) {
      console.error("Failed to start streaming:", err);
      setIsConnecting(false);
    }
  }, [
    connect,
    getSandboxLivestream,
    roomName,
    cameraStream,
    microphoneStream,
    isConnected,
    isConnecting,
  ]);

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.box}>
        {error && <Text style={styles.errorText}>Error: {error}</Text>}
        <Text style={styles.roomHeading}>{roomName}</Text>
        <View style={styles.videoView}>
          {cameraStream ? (
            <RTCView
              style={styles.rtcView}
              streamURL={(cameraStream as MediaStreamWithURL).toURL()}
              objectFit="cover"
              mirror={true}
            />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                {isInitialized ? "Camera ready" : "Initializing camera..."}
              </Text>
            </View>
          )}
        </View>
        {isConnecting && !isConnected ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={BrandColors.darkBlue100} />
            <Text style={styles.loaderText}>Connecting...</Text>
          </View>
        ) : (
          <Button
            title={isConnected ? "Stop Streaming" : "Start Streaming"}
            onPress={isConnected ? handleDisconnect : handleConnect}
            disabled={!isInitialized}
          />
        )}
        <Text style={styles.statusText}>
          Status: {isConnected ? "Streaming" : isConnecting ? "Connecting..." : "Not streaming"}
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
  loaderContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loaderText: {
    fontSize: 14,
    color: BrandColors.darkBlue100,
  },
});

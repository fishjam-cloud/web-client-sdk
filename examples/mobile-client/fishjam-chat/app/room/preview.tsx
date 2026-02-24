import React, { useEffect, useState, useCallback, useRef } from "react";
import { StyleSheet, View, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import {
  useCamera,
  useMicrophone,
  useConnection,
  useSandbox,
  useInitializeDevices,
  RTCView,
} from "@fishjam-cloud/react-native-client";

import { Button, InCallButton, NoCameraView } from "../../components";
import { useMediaPermissions } from "../../hooks/useMediaPermissions";
import { BrandColors } from "../../utils/Colors";

export default function PreviewScreen() {
  const { roomName, userName } = useLocalSearchParams<{
    roomName: string;
    userName: string;
  }>();

  const { getSandboxPeerToken } = useSandbox();

  const { initializeDevices } = useInitializeDevices();
  const { cameraStream, startCamera, stopCamera, isCameraOn, toggleCamera } =
    useCamera();
  const { isMicrophoneOn, toggleMicrophone, startMicrophone, stopMicrophone } =
    useMicrophone();
  const { joinRoom, leaveRoom } = useConnection();

  const { granted: permissionsGranted, openSettings } = useMediaPermissions();

  const [isInitialized, setIsInitialized] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasJoinedRef = useRef(false);

  useEffect(() => {
    if (!permissionsGranted) return;

    const setup = async () => {
      try {
        await initializeDevices({ enableVideo: true, enableAudio: true });
        await startCamera();
        await startMicrophone();
        setIsInitialized(true);
      } catch (err) {
        console.error("Failed to initialize devices:", err);
        setError("Failed to initialize camera/microphone");
      }
    };
    setup();

    return () => {
      if (!hasJoinedRef.current) {
        try {
          leaveRoom();
        } catch (err) {
          console.error("Failed to leave room:", err);
        }
        stopCamera();
        stopMicrophone();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsGranted]);

  const handleJoinRoom = useCallback(async () => {
    try {
      setIsJoining(true);
      setError(null);

      const displayName = userName || "Mobile User";
      const peerToken = await getSandboxPeerToken(roomName ?? "", displayName);

      await joinRoom({
        peerToken,
        peerMetadata: {
          displayName,
        },
      });

      hasJoinedRef.current = true;

      router.replace({
        pathname: "/room/[roomName]",
        params: { roomName: roomName ?? "", userName: displayName },
      });
    } catch (err) {
      console.error("Failed to join room:", err);
      setError("Failed to join room. Please try again.");
    } finally {
      setIsJoining(false);
    }
  }, [getSandboxPeerToken, roomName, joinRoom, userName]);

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {error && <Text style={styles.errorText}>{error}</Text>}

      <Text style={styles.roomHeading}>{roomName}</Text>

      <View style={styles.cameraPreview}>
        {!isInitialized ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={BrandColors.darkBlue100} />
            <Text style={styles.loadingText}>
              {!permissionsGranted
                ? "Requesting permissions..."
                : "Initializing camera..."}
            </Text>
          </View>
        ) : cameraStream ? (
          <RTCView
            mediaStream={cameraStream}
            style={styles.cameraPreviewView}
            objectFit="cover"
            mirror={true}
          />
        ) : (
          <NoCameraView username={userName ?? "You"} />
        )}
      </View>

      <View style={styles.mediaButtonsWrapper}>
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
      </View>

      <View style={styles.joinButton}>
        {permissionsGranted === false ? (
          <Button
            title="Open Settings"
            type="secondary"
            onPress={openSettings}
          />
        ) : (
          <Button
            title={isJoining ? "Joining..." : "Join Room"}
            onPress={handleJoinRoom}
            disabled={!isInitialized || isJoining}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#F1FAFE",
    padding: 24,
  },
  roomHeading: {
    fontSize: 22,
    fontWeight: "700",
    color: BrandColors.darkBlue100,
    marginBottom: 16,
  },
  cameraPreview: {
    flex: 1,
    width: "100%",
    maxHeight: "60%",
    aspectRatio: 9 / 16,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BrandColors.darkBlue80,
    overflow: "hidden",
  },
  cameraPreviewView: {
    width: "100%",
    height: "100%",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: BrandColors.seaBlue20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: BrandColors.darkBlue100,
  },
  mediaButtonsWrapper: {
    flexDirection: "row",
    gap: 20,
    marginTop: 24,
  },
  joinButton: {
    width: "100%",
    marginTop: 24,
  },
  errorText: {
    color: "red",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },
});

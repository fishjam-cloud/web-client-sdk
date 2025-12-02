

import {
  FishjamProvider,
  RTCView,
  useCamera,
  useConnection,
  useMicrophone,
  usePeers,
  useSandbox} from "@fishjam-cloud/mobile-client";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

function FishjamApp() {
  const [peerToken, setPeerToken] = useState("");

  const { joinRoom, leaveRoom, peerStatus } = useConnection();
  const { toggleCamera, isCameraOn, cameraStream } = useCamera();
  const { toggleMicrophone, isMicrophoneOn } = useMicrophone();
  const { localPeer, remotePeers } = usePeers();

  const { getSandboxPeerToken } = useSandbox();

  useEffect(() => {
    getSandboxPeerToken("test", Platform.OS === "ios" ? "ios" : "android").then((token) => {
      setPeerToken(token);
    });
  }, []);

  const isConnected = peerStatus === "connected";

  const handleStartCamera = async () => {
    try {
      await toggleCamera();
    } catch (error) {
      Alert.alert("Camera Error", `Failed to access camera: ${error}`);
    }
  };

  const handleConnect = async () => {
    if (!peerToken) {
      Alert.alert("Error", "Please enter peer token");
      return;
    }

    if (!isCameraOn) {
      Alert.alert("Error", "Please start camera first");
      return;
    }

    try {
      await joinRoom({
        peerToken,
        peerMetadata: { displayName: "React Native Peer", paused: false },
      });

      // Enable microphone after joining
      if (!isMicrophoneOn) {
        await toggleMicrophone();
      }
    } catch (error) {
      Alert.alert("Connection Error", `Failed to connect: ${error}`);
    }
  };

  const handleDisconnect = () => {
    leaveRoom();
    // Optionally turn off camera and mic
    if (isCameraOn) toggleCamera();
    if (isMicrophoneOn) toggleMicrophone();
  };

  const getStatusText = () => {
    switch (peerStatus) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting...";
      case "error":
        return "Connection Error";
      case "idle":
      default:
        return "Disconnected";
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fishjam React Native</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter Peer Token"
          value={peerToken}
          onChangeText={() => {}}
          autoCapitalize="none"
          editable={!isConnected}
        />
        <Text style={styles.status}>Status: {getStatusText()}</Text>
        {localPeer && (
          <Text style={styles.status}>
            Your ID: {localPeer.id.substring(0, 12)}...
          </Text>
        )}
      </View>

      <View style={styles.buttonRow}>
        <View style={styles.button}>
          <Button
            title={isCameraOn ? "Stop Camera" : "Start Camera"}
            onPress={isCameraOn ? () => toggleCamera() : handleStartCamera}
            color={isCameraOn ? "#dc3545" : "#007bff"}
          />
        </View>
        <View style={styles.button}>
          <Button
            title={isConnected ? "Disconnect" : "Connect"}
            onPress={isConnected ? handleDisconnect : handleConnect}
            disabled={!isCameraOn || peerStatus === "connecting"}
            color={isConnected ? "#dc3545" : "#28a745"}
          />
        </View>
      </View>

      {isCameraOn && (
        <View style={styles.buttonRow}>
          <View style={styles.button}>
            <Button
              title={isMicrophoneOn ? "🎤 Mute" : "🔇 Unmute"}
              onPress={toggleMicrophone}
              color="#6c757d"
            />
          </View>
        </View>
      )}

      {/* Local Video */}
      {cameraStream && (
        <View style={styles.videoContainer}>
          <Text style={styles.videoLabel}>
            📹 You {isMicrophoneOn ? "🎤" : "🔇"}
          </Text>
          <RTCView
            style={styles.video}
            streamURL={(cameraStream as any).toURL()}
            mirror={true}
            objectFit="cover"
          />
        </View>
      )}

      {/* Remote Videos */}
      <ScrollView style={styles.remoteVideos}>
        {remotePeers.map((peer) => {
          const videoTrack = peer.cameraTrack;
          if (!videoTrack?.stream) return null;

          const peerName = (peer.metadata?.peer as any)?.name || "Unknown";
          const hasMic = !!peer.microphoneTrack;

          return (
            <View key={peer.id} style={styles.videoContainer}>
              <Text style={styles.videoLabel}>
                📹 {peerName} {hasMic ? "🎤" : "🔇"}
              </Text>
              <RTCView
                style={styles.video}
                streamURL={(videoTrack.stream as any).toURL()}
                objectFit="cover"
              />
            </View>
          );
        })}
        {remotePeers.length === 0 && isConnected && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Waiting for others to join...</Text>
            <Text style={styles.emptySubtext}>
              Share the room link to invite peers
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Status Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          Camera: {isCameraOn ? "✅" : "❌"} | Mic:{" "}
          {isMicrophoneOn ? "✅" : "❌"} | Remote Peers: {remotePeers.length}
        </Text>
      </View>
    </View>
  );
}

export default function App() {
  const FISHJAM_URL = "62504184eb3f486e95bd5d0dee22d651";

  return (
    <FishjamProvider fishjamId={FISHJAM_URL} reconnect={true}>
      <FishjamApp />
    </FishjamProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    padding: 20,
    paddingTop: Platform.OS === "ios" ? 50 : 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
    color: "#333",
  },
  section: {
    marginBottom: 15,
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
    color: "#333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    fontSize: 14,
    backgroundColor: "#fff",
  },
  status: {
    fontSize: 14,
    color: "#666",
    marginTop: 5,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 15,
  },
  button: {
    flex: 1,
    marginHorizontal: 5,
  },
  videoContainer: {
    marginBottom: 15,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  videoLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  video: {
    width: "100%",
    height: 200,
    backgroundColor: "#000",
    borderRadius: 8,
  },
  remoteVideos: {
    flex: 1,
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    textAlign: "center",
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptySubtext: {
    textAlign: "center",
    color: "#999",
    fontSize: 14,
  },
  infoContainer: {
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: "#fff",
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  infoText: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    fontWeight: "500",
  },
});

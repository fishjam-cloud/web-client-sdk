import {
  FishjamProvider,
  RTCPIPView,
  RTCView,
  ScreenCapturePickerView,
  startPIP,
  useCamera,
  useConnection,
  useInitializeDevices,
  useLivestreamStreamer,
  useLivestreamViewer,
  useMicrophone,
  usePeers,
  useSandbox,
  useScreenShare,
} from "@fishjam-cloud/mobile-client";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  NativeModules,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// Helper type for MediaStream with toURL method from react-native-webrtc
interface MediaStreamWithURL extends MediaStream {
  toURL(): string;
}

const SCREENSHARING_TRACK_CONSTRAINTS: MediaTrackConstraints = {
  frameRate: { ideal: 20, max: 25 },
  width: { max: 1920, ideal: 1920 },
  height: { max: 1080, ideal: 1080 },
};

type TabType = "conference" | "livestream";
type LivestreamMode = "streamer" | "viewer";

// Tab Navigation Component
function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}) {
  return (
    <View style={styles.tabBar}>
      <TouchableOpacity
        style={[styles.tab, activeTab === "conference" && styles.activeTab]}
        onPress={() => onTabChange("conference")}
      >
        <Text
          style={[
            styles.tabText,
            activeTab === "conference" && styles.activeTabText,
          ]}
        >
          Conference
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === "livestream" && styles.activeTab]}
        onPress={() => onTabChange("livestream")}
      >
        <Text
          style={[
            styles.tabText,
            activeTab === "livestream" && styles.activeTabText,
          ]}
        >
          Livestream
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Livestream Mode Selector Component
function ModeSelector({
  mode,
  onModeChange,
  disabled,
}: {
  mode: LivestreamMode;
  onModeChange: (newMode: LivestreamMode) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.modeSelector}>
      <TouchableOpacity
        style={[
          styles.modeButton,
          mode === "streamer" && styles.activeModeButton,
          disabled && styles.disabledButton,
        ]}
        onPress={() => onModeChange("streamer")}
        disabled={disabled}
      >
        <Text
          style={[
            styles.modeButtonText,
            mode === "streamer" && styles.activeModeButtonText,
          ]}
        >
          Streamer
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.modeButton,
          mode === "viewer" && styles.activeModeButton,
          disabled && styles.disabledButton,
        ]}
        onPress={() => onModeChange("viewer")}
        disabled={disabled}
      >
        <Text
          style={[
            styles.modeButtonText,
            mode === "viewer" && styles.activeModeButtonText,
          ]}
        >
          Viewer
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Livestream App Component
function LivestreamApp() {
  const [mode, setMode] = useState<LivestreamMode>("streamer");
  const [roomName, setRoomName] = useState("livestream-test");
  const [isLoading, setIsLoading] = useState(false);

  // Sandbox API for tokens
  const { getSandboxLivestream, getSandboxViewerToken } = useSandbox();

  // Streamer hooks
  const { toggleCamera, isCameraOn, cameraStream } = useCamera();
  const { toggleMicrophone, isMicrophoneOn, microphoneStream } =
    useMicrophone();
  const { initializeDevices } = useInitializeDevices();
  const {
    connect: connectStreamer,
    disconnect: disconnectStreamer,
    isConnected: isStreamerConnected,
    error: streamerError,
  } = useLivestreamStreamer();

  // Viewer hooks
  const {
    connect: connectViewer,
    disconnect: disconnectViewer,
    stream: viewerStream,
    isConnected: isViewerConnected,
    error: viewerError,
  } = useLivestreamViewer();

  useEffect(() => {
    if (mode === "streamer") {
      initializeDevices({ enableVideo: true, enableAudio: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleStartCamera = async () => {
    try {
      await toggleCamera();
    } catch (error) {
      Alert.alert("Camera Error", `Failed to access camera: ${error}`);
    }
  };

  const handleStartStreaming = async () => {
    if (!roomName.trim()) {
      Alert.alert("Error", "Please enter a room name");
      return;
    }

    if (!cameraStream) {
      Alert.alert("Error", "Please start camera first");
      return;
    }

    setIsLoading(true);
    try {
      // Get streamer token from sandbox API
      const { streamerToken } = await getSandboxLivestream(roomName);

      // Enable microphone if not already on
      if (!isMicrophoneOn) {
        await toggleMicrophone();
      }

      // Connect and start streaming
      await connectStreamer({
        token: streamerToken,
        inputs: {
          video: cameraStream,
          audio: microphoneStream ?? undefined,
        },
      });

      Alert.alert("Success", "You are now streaming!");
    } catch (error) {
      Alert.alert("Streaming Error", `Failed to start streaming: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopStreaming = () => {
    disconnectStreamer();
    if (isCameraOn) toggleCamera();
    if (isMicrophoneOn) toggleMicrophone();
  };

  const handleStartViewing = async () => {
    if (!roomName.trim()) {
      Alert.alert("Error", "Please enter a room name");
      return;
    }

    setIsLoading(true);
    try {
      // Get viewer token from sandbox API
      const viewerToken = await getSandboxViewerToken(roomName);

      // Connect and start viewing
      await connectViewer({ token: viewerToken });
    } catch (error) {
      Alert.alert("Viewing Error", `Failed to connect to stream: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopViewing = () => {
    disconnectViewer();
  };

  const handleModeChange = (newMode: LivestreamMode) => {
    // Clean up current mode before switching
    if (mode === "streamer" && isStreamerConnected) {
      handleStopStreaming();
    } else if (mode === "viewer" && isViewerConnected) {
      handleStopViewing();
    }
    setMode(newMode);
  };

  const isConnected =
    mode === "streamer" ? isStreamerConnected : isViewerConnected;
  const currentError = mode === "streamer" ? streamerError : viewerError;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fishjam Livestream</Text>

      {/* Mode Selector */}
      <ModeSelector
        mode={mode}
        onModeChange={handleModeChange}
        disabled={isConnected || isLoading}
      />

      {/* Room Name Input */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Room Settings</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter Room Name"
          value={roomName}
          onChangeText={setRoomName}
          autoCapitalize="none"
          editable={!isConnected && !isLoading}
        />
        <Text style={styles.status}>
          Mode: {mode === "streamer" ? "Streamer" : "Viewer"}
        </Text>
        <Text style={styles.status}>
          Status:{" "}
          {isConnected
            ? "Connected"
            : isLoading
              ? "Connecting..."
              : "Disconnected"}
        </Text>
        {currentError && (
          <Text style={[styles.status, { color: "#dc3545" }]}>
            Error: {currentError}
          </Text>
        )}
      </View>

      {/* Streamer Mode UI */}
      {mode === "streamer" && (
        <>
          <View style={styles.buttonRow}>
            <View style={styles.button}>
              <Button
                title={isCameraOn ? "Stop Camera" : "Start Camera"}
                onPress={isCameraOn ? () => toggleCamera() : handleStartCamera}
                color={isCameraOn ? "#dc3545" : "#007bff"}
                // disabled={isStreamerConnected}
              />
            </View>
            <View style={styles.button}>
              <Button
                title={
                  isStreamerConnected ? "Stop Streaming" : "Start Streaming"
                }
                onPress={
                  isStreamerConnected
                    ? handleStopStreaming
                    : handleStartStreaming
                }
                disabled={!isCameraOn || isLoading}
                color={isStreamerConnected ? "#dc3545" : "#28a745"}
              />
            </View>
          </View>

          {isCameraOn && (
            <View style={styles.buttonRow}>
              <View style={styles.button}>
                <Button
                  title={isMicrophoneOn ? "Mute Mic" : "Unmute Mic"}
                  onPress={toggleMicrophone}
                  color="#6c757d"
                />
              </View>
            </View>
          )}

          {/* Local Camera Preview */}
          {cameraStream && (
            <View style={styles.videoContainer}>
              <Text style={styles.videoLabel}>
                Your Camera {isMicrophoneOn ? "(Mic On)" : "(Mic Off)"}
                {isStreamerConnected && " - LIVE"}
              </Text>
              <RTCView
                style={styles.video}
                streamURL={(cameraStream as MediaStreamWithURL).toURL()}
                mirror={true}
                objectFit="cover"
              />
            </View>
          )}
        </>
      )}

      {/* Viewer Mode UI */}
      {mode === "viewer" && (
        <>
          <View style={styles.buttonRow}>
            <View style={styles.button}>
              <Button
                title={isViewerConnected ? "Stop Viewing" : "Start Viewing"}
                onPress={
                  isViewerConnected ? handleStopViewing : handleStartViewing
                }
                disabled={isLoading}
                color={isViewerConnected ? "#dc3545" : "#28a745"}
              />
            </View>
          </View>

          {/* Received Stream */}
          {viewerStream ? (
            <View style={styles.videoContainer}>
              <Text style={styles.videoLabel}>Livestream - LIVE</Text>
              <RTCView
                style={styles.videoLarge}
                streamURL={(viewerStream as MediaStreamWithURL).toURL()}
                objectFit="contain"
              />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {isViewerConnected
                  ? "Waiting for stream..."
                  : "Enter a room name and tap 'Start Viewing'"}
              </Text>
              <Text style={styles.emptySubtext}>
                Make sure a streamer is broadcasting to this room
              </Text>
            </View>
          )}
        </>
      )}

      {/* Status Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          {mode === "streamer"
            ? `Camera: ${isCameraOn ? "On" : "Off"} | Mic: ${isMicrophoneOn ? "On" : "Off"} | Streaming: ${isStreamerConnected ? "Yes" : "No"}`
            : `Viewing: ${isViewerConnected ? "Yes" : "No"} | Stream: ${viewerStream ? "Active" : "None"}`}
        </Text>
      </View>
    </View>
  );
}

// Conference App Component (Original FishjamApp)
function ConferenceApp() {
  const [peerToken, setPeerToken] = useState("");
  const view = useRef<typeof RTCView>(null);

  const { joinRoom, leaveRoom, peerStatus } = useConnection();
  const { toggleCamera, isCameraOn, cameraStream } = useCamera();
  const { toggleMicrophone, isMicrophoneOn } = useMicrophone();
  const { localPeer, remotePeers } = usePeers();
  const {
    startStreaming,
    stream: screenStream,
    stopStreaming,
  } = useScreenShare();
  const { initializeDevices } = useInitializeDevices();

  useEffect(() => {
    initializeDevices({ enableVideo: true, enableAudio: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { getSandboxPeerToken } = useSandbox();

  useEffect(() => {
    getSandboxPeerToken("test", Platform.OS === "ios" ? "ios" : "android").then(
      (token) => {
        setPeerToken(token);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        peerMetadata: {
          displayName: "React Native Peer",
          paused: false,
        },
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
    // Optionally turn off camera, mic, and screen share
    if (isCameraOn) toggleCamera();
    if (isMicrophoneOn) toggleMicrophone();
    if (screenStream) stopStreaming();
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

  const toggleScreenShare = async () => {
    if (screenStream) {
      return stopStreaming();
    }

    if (Platform.OS === "ios" && screenCaptureViewRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reactTag = (screenCaptureViewRef.current as any).__nativeTag;
      if (reactTag) {
        NativeModules.ScreenCapturePickerViewManager.show(reactTag);
      }
    }
    try {
      await startStreaming({
        videoConstraints: SCREENSHARING_TRACK_CONSTRAINTS,
      });
      Alert.alert("Screen Share", "You are now sharing your screen");
    } catch (error) {
      if (error instanceof Error && error.name === "NotAllowedError") {
        return;
      }
      console.error(error);
      Alert.alert(
        "Screen Share Error",
        `Failed to start screen share: ${error}`
      );
    }
  };

  const screenCaptureViewRef = useRef(null);

  return (
    <View style={styles.container}>
      {Platform.OS === "ios" && (
        <ScreenCapturePickerView ref={screenCaptureViewRef} />
      )}
      <Text style={styles.title}>Fishjam Conference</Text>
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
              title={isMicrophoneOn ? "Mute" : "Unmute"}
              onPress={toggleMicrophone}
              color="#6c757d"
            />
          </View>
        </View>
      )}

      {
        <View style={styles.button}>
          <Button
            title={screenStream ? "Stop Share" : "Share Screen"}
            onPress={toggleScreenShare}
            color={screenStream ? "#dc3545" : "#17a2b8"}
          />
        </View>
      }

      {isConnected && remotePeers.length > 0 && (
        <View style={styles.buttonRow}>
          <View style={styles.button}>
            <Button
              title="Enter PIP Mode"
              onPress={() => startPIP(view)}
              color="#9c27b0"
            />
          </View>
        </View>
      )}

      {/* Local Video - hidden in PIP mode on Android */}
      {cameraStream && (
        <View style={styles.videoContainer}>
          <Text style={styles.videoLabel}>
            You {isMicrophoneOn ? "(Mic On)" : "(Mic Off)"}
          </Text>
          <RTCView
            style={styles.video}
            streamURL={(cameraStream as MediaStreamWithURL).toURL()}
            mirror={true}
            objectFit="cover"
          />
        </View>
      )}

      {/* Screen Share - hidden in PIP mode on Android */}
      {screenStream && (
        <View style={styles.videoContainer}>
          <Text style={styles.videoLabel}>Your Screen Share</Text>
          <RTCView
            style={styles.video}
            streamURL={(screenStream as MediaStreamWithURL).toURL()}
            objectFit="contain"
          />
        </View>
      )}

      {/* Remote Videos */}
      <View style={styles.remoteVideos}>
        {remotePeers.map((peer, index) => {
          const videoTrack = peer.cameraTrack;
          const screenShareTrack = peer.screenShareVideoTrack;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const peerName = (peer.metadata?.peer as any)?.name || "Unknown";
          const hasMic = !!peer.microphoneTrack;
          // Show first remote peer's camera in PIP mode
          const showInPIP = index === 0;

          return (
            <React.Fragment key={peer.id}>
              {videoTrack?.stream && (
                <View style={styles.videoContainer}>
                  <Text style={styles.videoLabel}>
                    {peerName} {hasMic ? "(Mic On)" : "(Mic Off)"}
                  </Text>
                  {showInPIP ? (
                    <RTCPIPView
                      ref={view}
                      style={styles.video}
                      pip={{
                        startAutomatically: true,
                        stopAutomatically: true,
                        enabled: true,
                      }}
                      streamURL={(
                        videoTrack.stream as MediaStreamWithURL
                      ).toURL()}
                      objectFit="cover"
                    />
                  ) : (
                    <RTCView
                      style={styles.video}
                      streamURL={(
                        videoTrack.stream as MediaStreamWithURL
                      ).toURL()}
                      objectFit="cover"
                    />
                  )}
                </View>
              )}
              {screenShareTrack?.stream && (
                <View style={styles.videoContainer}>
                  <Text style={styles.videoLabel}>{peerName}'s Screen</Text>
                  <RTCView
                    style={styles.video}
                    streamURL={(
                      screenShareTrack.stream as MediaStreamWithURL
                    ).toURL()}
                    objectFit="contain"
                  />
                </View>
              )}
            </React.Fragment>
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
      </View>

      {/* Status Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          Camera: {isCameraOn ? "On" : "Off"} | Mic:{" "}
          {isMicrophoneOn ? "On" : "Off"} | Screen:{" "}
          {screenStream ? "On" : "Off"} | Peers: {remotePeers.length}
        </Text>
      </View>
    </View>
  );
}

// Main App with Tab Navigation
function MainApp() {
  const [activeTab, setActiveTab] = useState<TabType>("conference");

  return (
    <View style={styles.mainContainer}>
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <ScrollView style={{ flex: 1 }}>
        {activeTab === "conference" ? <ConferenceApp /> : <LivestreamApp />}
      </ScrollView>
    </View>
  );
}

export default function App() {
  const FISHJAM_URL = "ac6624ea6bc14104a1b340d5dffc8dbd";

  return (
    <FishjamProvider fishjamId={FISHJAM_URL} reconnect={true}>
      <MainApp />
    </FishjamProvider>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    paddingTop: Platform.OS === "ios" ? 50 : 20,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingHorizontal: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: "#007bff",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#666",
  },
  activeTabText: {
    color: "#007bff",
    fontWeight: "600",
  },
  modeSelector: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 15,
    marginBottom: 10,
    backgroundColor: "#e9ecef",
    borderRadius: 10,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  activeModeButton: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  disabledButton: {
    opacity: 0.5,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
  },
  activeModeButtonText: {
    color: "#007bff",
    fontWeight: "600",
  },
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 15,
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
  videoLarge: {
    width: "100%",
    height: 300,
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

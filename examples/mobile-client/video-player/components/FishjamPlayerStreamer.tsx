import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useInitializeDevices, useCamera, useLivestreamStreamer, useMicrophone, useSandbox, RTCView } from "@fishjam-cloud/mobile-client"
import { useEffect, useRef } from "react";

// Helper type for MediaStream with toURL method from react-native-webrtc
interface MediaStreamWithURL extends MediaStream {
    toURL(): string;
}

export const FishjamPlayerStreamer = ({ roomName }: { roomName: string }) => {
    const { getSandboxLivestream } = useSandbox();

    const { toggleCamera, stopCamera, startCamera, isCameraOn, cameraStream } = useCamera();
    const { toggleMicrophone, stopMicrophone, startMicrophone, isMicrophoneOn, microphoneStream } = useMicrophone();
    const { connect, disconnect, isConnected } = useLivestreamStreamer();
    const { initializeDevices } = useInitializeDevices();

    useEffect(() => {
        const setup = async () => {
            console.log("Initializing devices");
            await initializeDevices({ enableVideo: true, enableAudio: true });
            await startCamera();
            await startMicrophone();
        };
        setup();

        return () => {
            disconnect();
            console.log("Stopping camera and microphone");
            stopCamera();
            stopMicrophone();
        };
        //TODO: FCE-2509 Add dependencies when startCamera gets fixed
    }, []);

    console.log("Is camera on: ", isCameraOn);
    console.log("Is microphone on: ", isMicrophoneOn);

    const handleDisconnect = () => {
        disconnect();
    };

    const handleConnect = async () => {
        if (isConnected) return;
        if (!cameraStream || !microphoneStream) {
            console.error("Camera or microphone stream not available");
            return;
        }

        try {
            const { streamerToken } = await getSandboxLivestream(roomName);
            
            await connect({
                token: streamerToken,
                inputs: { video: cameraStream, audio: microphoneStream }
            });
        } catch (error) {
            console.error(error);
        }
    };

    const handleToggleCamera = async () => {
        await toggleCamera();
    };

    const handleToggleMicrophone = async () => {
        await toggleMicrophone();
    };

    return (
        <View style={styles.container}>
            <View style={styles.videoContainer}>
                <RTCView
                    style={styles.video}
                    streamURL={cameraStream ? (cameraStream as MediaStreamWithURL).toURL() : undefined}
                    mirror={true}
                    objectFit="cover"
                />
                {isConnected && (
                    <View style={styles.liveIndicator}>
                        <View style={styles.liveDot} />
                        <Text style={styles.liveText}>LIVE</Text>
                    </View>
                )}
                {!isCameraOn && (
                    <View style={styles.cameraOffOverlay}>
                        <Text style={styles.cameraOffText}>📷</Text>
                        <Text style={styles.cameraOffLabel}>Camera Off</Text>
                    </View>
                )}
            </View>
            
            <View style={styles.controls}>
                <View style={styles.mediaControls}>
                    <TouchableOpacity 
                        style={[styles.mediaButton, !isCameraOn && styles.mediaButtonOff]} 
                        onPress={handleToggleCamera}
                    >
                        <Text style={styles.mediaButtonText}>{isCameraOn ? "📹" : "🚫"}</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                        style={[styles.mediaButton, !isMicrophoneOn && styles.mediaButtonOff]} 
                        onPress={handleToggleMicrophone}
                    >
                        <Text style={styles.mediaButtonText}>{isMicrophoneOn ? "🎤" : "🔇"}</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity 
                    style={[styles.button, isConnected ? styles.stopButton : styles.startButton]} 
                    onPress={isConnected ? handleDisconnect : handleConnect}
                >
                    <Text style={styles.buttonText}>
                        {isConnected ? "⏹️ Stop Streaming" : "🔴 Start Streaming"}
                    </Text>
                </TouchableOpacity>
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
    liveIndicator: {
        position: "absolute",
        top: 16,
        left: 16,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(239, 68, 68, 0.9)",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#fff",
        marginRight: 6,
    },
    liveText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "bold",
    },
    cameraOffOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "#1a1a2e",
        justifyContent: "center",
        alignItems: "center",
    },
    cameraOffText: {
        fontSize: 48,
        marginBottom: 8,
    },
    cameraOffLabel: {
        color: "#8892b0",
        fontSize: 16,
    },
    controls: {
        paddingTop: 16,
    },
    button: {
        height: 52,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 16,
    },
    startButton: {
        backgroundColor: "#22c55e",
    },
    stopButton: {
        backgroundColor: "#374151",
    },
    buttonText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#ffffff",
    },
    mediaControls: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 12,
        marginBottom: 12,
    },
    mediaButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: "#374151",
        justifyContent: "center",
        alignItems: "center",
    },
    mediaButtonOff: {
        backgroundColor: "#7f1d1d",
    },
    mediaButtonText: {
        fontSize: 20,
    },
});

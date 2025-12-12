import { Button, StyleSheet, View } from "react-native";
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
            <RTCView
                style={styles.video}
                streamURL={cameraStream ? (cameraStream as MediaStreamWithURL).toURL() : undefined}
                mirror={true}
                objectFit="cover"
            />
            <Button title={isConnected ? "Stop Streaming" : "Start Streaming"} onPress={isConnected ? handleDisconnect : handleConnect} />
            <Button title="Toggle Camera" onPress={handleToggleCamera} />
            <Button title={isMicrophoneOn ? "Mute Microphone" : "Unmute Microphone"} onPress={handleToggleMicrophone} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: "100%",
        height: "90%",
        marginTop: 20,
    },
    video: {
        width: "100%",
        height: "80%",
        backgroundColor: "black",
    },
});

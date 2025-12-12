import { View, StyleSheet } from "react-native";
import { useSandbox, useLivestreamViewer, RTCView } from '@fishjam-cloud/mobile-client';
import { useEffect } from "react";

interface MediaStreamWithURL extends MediaStream {
    toURL(): string;
}

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
    }, []);

    return (
        <View style={styles.container}>
            {stream && (
                <RTCView
                    style={styles.video}
                    streamURL={(stream as MediaStreamWithURL).toURL()}
                    mirror={true}
                    objectFit="cover"
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        height: "90%",
        marginTop: 20,
        backgroundColor: "black",
    },
    video: {
        width: "100%",
        height: "100%",
    },
});
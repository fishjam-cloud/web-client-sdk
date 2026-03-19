import {
  useInitializeDevices,
  useLivestreamStreamer,
  useSandbox,
  useScreenShare,
} from '@fishjam-cloud/react-native-client';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components';
import { BrandColors } from '../../utils/Colors';
import { changeFishjamId } from '../../utils/fishjamIdStore';

export default function LivestreamScreenSharingScreen() {
  const { roomName, fishjamId } = useLocalSearchParams<{
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
  const isMountedRef = useRef(true);

  const handleStartScreenShare = useCallback(async () => {
    try {
      setIsStarting(true);
      await startScreenCapture();
    } catch (err) {
      console.error('Failed to start screen capture:', err);
    } finally {
      if (isMountedRef.current) {
        setIsStarting(false);
      }
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
          console.error('Failed to connect to livestream:', err);
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
      console.error('Failed to stop screen share:', err);
    }
  }, [disconnect, stopScreenCapture]);

  useEffect(() => {
    isMountedRef.current = true;

    if (fishjamId) {
      changeFishjamId(fishjamId);
    }

    const setup = async () => {
      try {
        await initializeDevices({ enableVideo: false, enableAudio: true });
      } catch (err) {
        console.error('Failed to initialize devices:', err);
      }
    };
    setup();

    return () => {
      isMountedRef.current = false;
      try {
        disconnect();
      } catch (err) {
        console.error('Failed to disconnect on unmount:', err);
      }
      stopScreenCapture().catch((err: unknown) => {
        console.error('Failed to stop screen capture on unmount:', err);
      });
    };
  }, [initializeDevices, disconnect, stopScreenCapture]);

  const isScreenSharing = Boolean(screenStream) && isConnected;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.box}>
        {error && <Text style={styles.errorText}>Error: {error}</Text>}

        <Text style={styles.roomHeading}>{roomName}</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Screen sharing broadcasts your device screen to livestream viewers.
          </Text>
        </View>

        {!isScreenSharing ? (
          <Button
            title={isStarting ? 'Starting...' : 'Start Screen Capture'}
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
          Status: {isScreenSharing ? 'Streaming' : 'Not streaming'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1FAFE',
    padding: 24,
  },
  box: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  roomHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: BrandColors.darkBlue100,
  },
  infoBox: {
    backgroundColor: BrandColors.seaBlue40,
    padding: 16,
    borderRadius: 12,
    width: '100%',
  },
  infoText: {
    fontSize: 14,
    color: BrandColors.darkBlue100,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 14,
    color: BrandColors.darkBlue100,
  },
  errorText: {
    color: 'red',
    fontSize: 14,
    textAlign: 'center',
  },
});

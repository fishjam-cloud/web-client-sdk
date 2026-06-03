import {
  useForegroundService,
  useLivestreamScreenShare,
  useSandbox,
} from '@fishjam-cloud/react-native-client';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components';
import { BrandColors } from '../../utils/Colors';

export default function LivestreamScreenSharingScreen() {
  const { roomName } = useLocalSearchParams<{
    roomName: string;
    fishjamId?: string;
  }>();

  const { getSandboxLivestream } = useSandbox({
    sandboxApiUrl: process.env.EXPO_PUBLIC_SANDBOX_API_URL ?? '',
  });
  // Background-tolerant screen-share livestream: the dedicated broadcast extension owns the
  // WebRTC pipeline, so the stream keeps running when the app is backgrounded.
  const {
    startScreenShareLivestream,
    stopScreenShareLivestream,
    status,
    error,
    isStreaming,
  } = useLivestreamScreenShare();

  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const handleStartScreenShare = useCallback(async () => {
    if (!roomName) return;
    try {
      setIsStarting(true);
      setStartError(null);
      const { streamerToken } = await getSandboxLivestream(roomName);
      // Hands the credentials to the broadcast extension and presents the system picker.
      await startScreenShareLivestream({ token: streamerToken });
    } catch (err) {
      console.error('Failed to start livestream screen share:', err);
      setStartError(err instanceof Error ? err.message : 'Failed to start');
    } finally {
      setIsStarting(false);
    }
  }, [roomName, getSandboxLivestream, startScreenShareLivestream]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.box}>
        {startError && (
          <Text style={styles.errorText}>Error: {startError}</Text>
        )}
        {status === 'failed' && error && (
          <Text style={styles.errorText}>Livestream failed: {error}</Text>
        )}

        <Text style={styles.roomHeading}>{roomName}</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Screen sharing allows you to broadcast your device screen to
            viewers. The stream keeps running while the app is in the
            background.
          </Text>
        </View>

        {isStreaming || status === 'connecting' || status === 'starting' ? (
          <Button
            title="Stop Screen Capture"
            type="secondary"
            onPress={stopScreenShareLivestream}
          />
        ) : (
          <Button
            title={isStarting ? 'Starting...' : 'Start Screen Capture'}
            onPress={handleStartScreenShare}
            disabled={isStarting}
          />
        )}

        <Text style={styles.statusText}>Status: {status}</Text>
        <Text style={styles.statusText}>
          Use the system broadcast picker to start or stop streaming.
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

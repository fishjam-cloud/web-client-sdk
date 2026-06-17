import {
  useCallKitEvent,
  useCallKitService,
  useCamera,
  useConnection,
  useForegroundService,
  useMicrophone,
  usePeers,
  useScreenShare,
} from '@fishjam-cloud/react-native-client';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InCallButton, VideosGrid } from '../../components';
import { useRemoteTranscription } from '../../hooks/useRemoteTranscription';

export default function RoomScreen() {
  const { userName } = useLocalSearchParams<{
    roomName: string;
    userName: string;
  }>();

  const { isCameraOn, toggleCamera, stopCamera } = useCamera();
  const { isMicrophoneOn, toggleMicrophone, stopMicrophone, startMicrophone } =
    useMicrophone();
  const { leaveRoom } = useConnection();
  const { remotePeers } = usePeers();
  const {
    startStreaming,
    stopStreaming,
    stream: screenShareStream,
    presentBroadcastPicker,
  } = useScreenShare();

  // On-device transcription of the first remote peer's audio (POC).
  const remoteAudioTrack = remotePeers
    .flatMap((peer) => (peer.microphoneTrack ? [peer.microphoneTrack] : []))
    .map((t) => t.track)
    .find((track) => track != null);
  const transcription = useRemoteTranscription(remoteAudioTrack);

  const handleDisconnect = useCallback(async () => {
    if (screenShareStream && Platform.OS === 'ios') {
      // iOS: must end the broadcast via the system sheet first to avoid
      // the "Screen sharing stopped" error dialog. Tap leave again after.
      try {
        await presentBroadcastPicker();
        return;
      } catch (e) {
        console.error('Error presenting broadcast picker:', e);
      }
    }
    try {
      if (screenShareStream) {
        await stopStreaming();
      }
      leaveRoom();
    } catch (e) {
      console.error('Error leaving room:', e);
    }
    router.replace('/(tabs)/room');
  }, [leaveRoom, presentBroadcastPicker, screenShareStream, stopStreaming]);

  const handleToggleScreenShare = useCallback(async () => {
    try {
      if (screenShareStream) {
        if (Platform.OS === 'ios') {
          await presentBroadcastPicker();
        } else {
          await stopStreaming();
        }
      } else {
        await startStreaming();
      }
    } catch (e) {
      console.error('Error toggling screen share:', e);
    }
  }, [
    presentBroadcastPicker,
    screenShareStream,
    startStreaming,
    stopStreaming,
  ]);

  useForegroundService({
    channelName: 'Fishjam Chat Notifications',
    notificationTitle: 'Your video call is ongoing',
    notificationContent: 'Tap to return to the call.',
    enableCamera: true,
    enableMicrophone: true,
    enableScreenSharing: true,
  });

  useCallKitService({
    displayName: userName ?? 'You',
    isVideo: true,
  });

  useCallKitEvent('ended', () => {
    handleDisconnect();
  });

  useCallKitEvent('muted', (isMuted?: boolean) => {
    if (isMuted === true) {
      stopMicrophone();
    } else if (isMuted === false) {
      startMicrophone();
    }
  });

  useCallKitEvent('held', (isHeld?: boolean) => {
    if (isHeld === true) {
      stopMicrophone();
    } else if (isHeld === false) {
      startMicrophone();
    }
  });

  useEffect(() => {
    return () => {
      try {
        leaveRoom();
      } catch (e) {
        console.error('Error leaving room:', e);
      }
      stopCamera();
      stopMicrophone();
    };
  }, [leaveRoom, stopCamera, stopMicrophone]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <VideosGrid username={userName ?? 'You'} />

      {transcription.active && (
        <View style={styles.transcriptPanel}>
          <Text style={styles.transcriptTitle}>
            {transcription.isReady
              ? 'Transcribing remote audio…'
              : `Loading model… ${Math.round(transcription.downloadProgress * 100)}%`}
          </Text>
          {transcription.isReady && (
            <ScrollView style={styles.transcriptScroll}>
              <Text style={styles.transcriptText}>
                {transcription.transcript || '(listening…)'}
              </Text>
            </ScrollView>
          )}
        </View>
      )}

      <View style={styles.callView}>
        <InCallButton
          type="disconnect"
          iconName="phone-hangup"
          onPress={handleDisconnect}
          accessibilityLabel="Disconnect"
        />
        <InCallButton
          iconName={isMicrophoneOn ? 'microphone' : 'microphone-off'}
          onPress={toggleMicrophone}
          accessibilityLabel="Toggle Microphone"
        />
        <InCallButton
          iconName={isCameraOn ? 'camera' : 'camera-off'}
          onPress={toggleCamera}
          accessibilityLabel="Toggle Camera"
        />
        <InCallButton
          iconName={screenShareStream ? 'monitor-share' : 'monitor-off'}
          onPress={handleToggleScreenShare}
          accessibilityLabel="Toggle Screen Share"
        />
        <InCallButton
          iconName={transcription.active ? 'ear-hearing' : 'ear-hearing-off'}
          onPress={transcription.toggle}
          accessibilityLabel="Toggle Transcription"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: '#F1FAFE',
  },
  callView: {
    position: 'absolute',
    bottom: 30,
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 12,
    borderRadius: 30,
  },
  transcriptPanel: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    maxHeight: 160,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 12,
    padding: 12,
  },
  transcriptTitle: {
    color: '#9FD8FF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  transcriptScroll: {
    maxHeight: 120,
  },
  transcriptText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
  },
});

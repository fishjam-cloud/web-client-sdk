import {
  RTCView,
  startPIP,
  stopPIP,
  useCallKitEvent,
  useCallKitService,
  useCamera,
  useConnection,
  useForegroundService,
  useMicrophone,
  useScreenShare,
} from '@fishjam-cloud/react-native-client';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DebugOverlay,
  InCallButton,
  PeerMetadataEditor,
  ReconnectionBanner,
  TextChat,
  VideosGrid,
} from '../../components';

export default function RoomScreen() {
  const { userName } = useLocalSearchParams<{
    roomName: string;
    userName: string;
  }>();

  const displayName = userName ?? 'You';

  const { isCameraOn, toggleCamera, stopCamera, cameraStream } = useCamera();
  const pipViewRef = useRef<React.ComponentRef<typeof RTCView>>(null);
  const { isMicrophoneOn, toggleMicrophone, stopMicrophone, startMicrophone } =
    useMicrophone();
  const { leaveRoom } = useConnection();
  const {
    startStreaming,
    stopStreaming,
    stream: screenShareStream,
  } = useScreenShare();

  const [chatOpen, setChatOpen] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  const handleDisconnect = useCallback(async () => {
    try {
      if (screenShareStream) {
        await stopStreaming();
      }
      leaveRoom();
      router.replace('/(tabs)/room');
    } catch (e) {
      console.error('Error leaving room:', e);
      leaveRoom();
      router.replace('/(tabs)/room');
    }
  }, [leaveRoom, screenShareStream, stopStreaming]);

  const handleToggleScreenShare = useCallback(async () => {
    try {
      if (screenShareStream) {
        await stopStreaming();
      } else {
        await startStreaming();
      }
    } catch (e) {
      console.error('Error toggling screen share:', e);
    }
  }, [screenShareStream, startStreaming, stopStreaming]);

  const handleStartPip = useCallback(() => {
    try {
      startPIP(pipViewRef as Parameters<typeof startPIP>[0]);
    } catch (e) {
      console.error('startPIP:', e);
    }
  }, []);

  const handleStopPip = useCallback(() => {
    try {
      stopPIP(pipViewRef as Parameters<typeof stopPIP>[0]);
    } catch (e) {
      console.error('stopPIP:', e);
    }
  }, []);

  useForegroundService({
    channelName: 'Fishjam Showcase',
    notificationTitle: 'Fishjam showcase call',
    notificationContent: 'Tap to return.',
    enableCamera: true,
    enableMicrophone: true,
    enableScreenSharing: true,
  });

  useCallKitService({
    displayName,
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
      <ReconnectionBanner />
      {cameraStream ? (
        <RTCView
          ref={pipViewRef}
          mediaStream={cameraStream}
          style={styles.pipHiddenHost}
          objectFit="cover"
          mirror
        />
      ) : null}
      <VideosGrid username={displayName} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.callViewScroll}>
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
            iconName="picture-in-picture-bottom-right"
            onPress={handleStartPip}
            accessibilityLabel="Start PiP"
          />
          <InCallButton
            iconName="close-circle-outline"
            onPress={handleStopPip}
            accessibilityLabel="Stop PiP"
          />
          <InCallButton
            iconName="message-text-outline"
            onPress={() => setChatOpen(true)}
            accessibilityLabel="Data channel chat"
          />
          <InCallButton
            iconName="account-edit-outline"
            onPress={() => setMetadataOpen(true)}
            accessibilityLabel="Edit display name"
          />
          <InCallButton
            iconName="bug-outline"
            onPress={() => setDebugOpen(true)}
            accessibilityLabel="Debug overlay"
          />
        </View>
      </ScrollView>

      <TextChat
        visible={chatOpen}
        onRequestClose={() => setChatOpen(false)}
        userName={displayName}
      />
      <PeerMetadataEditor
        visible={metadataOpen}
        onRequestClose={() => setMetadataOpen(false)}
        currentDisplayName={displayName}
      />
      <DebugOverlay
        visible={debugOpen}
        onClose={() => setDebugOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: '#F1FAFE',
  },
  pipHiddenHost: {
    position: 'absolute',
    width: 2,
    height: 2,
    opacity: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  callViewScroll: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  callView: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 12,
    borderRadius: 30,
    marginBottom: 16,
  },
});

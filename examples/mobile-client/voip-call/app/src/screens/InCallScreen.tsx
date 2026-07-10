import {
  useAudioOutput,
  useCamera,
  useMicrophone,
  usePeers,
  useVAD,
} from '@fishjam-cloud/react-native-client';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, InCallButton, VideoCallView } from '../components';
import { AdditionalColors, BrandColors, TextColors } from '../theme/colors';
import { useVoip } from '../voip';

type PeerMeta = { displayName?: string };

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function useElapsed(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

export function InCallScreen() {
  const { currentCall, endCall } = useVoip();

  const { isMicrophoneOn, toggleMicrophone } = useMicrophone();
  const { isCameraOn, toggleCamera } = useCamera();
  const { currentAudioOutput, availableAudioOutputs, ios, android } =
    useAudioOutput();
  const { remotePeers } = usePeers<PeerMeta>();

  const peerIds = useMemo(() => remotePeers.map((p) => p.id), [remotePeers]);
  const speaking = useVAD({ peerIds });

  const elapsed = useElapsed(currentCall?.startedAt ?? null);
  const isSpeaker = currentAudioOutput?.type === 'speaker';

  if (!currentCall) return null;

  const isVideo = currentCall.isVideo;
  const displayName = currentCall.displayName;

  const toggleSpeaker = () => {
    if (Platform.OS === 'ios') {
      ios.overrideAudioOutput(isSpeaker ? 'none' : 'speaker');
      return;
    }
    const target = availableAudioOutputs.find(
      (device) => device.type === (isSpeaker ? 'earpiece' : 'speaker'),
    );
    if (target) {
      android
        .selectAudioOutput(target.id)
        .catch((err) => console.warn('Failed to switch audio output:', err));
    }
  };

  const controls = (
    <View style={styles.controls}>
      <InCallButton
        iconName={isMicrophoneOn ? 'microphone' : 'microphone-off'}
        active={!isMicrophoneOn}
        onPress={toggleMicrophone}
        accessibilityLabel="Toggle microphone"
      />
      {isVideo && (
        <InCallButton
          iconName={isCameraOn ? 'camera' : 'camera-off'}
          active={!isCameraOn}
          onPress={toggleCamera}
          accessibilityLabel="Toggle camera"
        />
      )}
      <InCallButton
        iconName={isSpeaker ? 'volume-high' : 'volume-medium'}
        active={isSpeaker}
        onPress={toggleSpeaker}
        accessibilityLabel="Toggle speaker"
      />
      <InCallButton
        type="disconnect"
        iconName="phone-hangup"
        onPress={() => endCall('local')}
        accessibilityLabel="End call"
      />
    </View>
  );

  if (isVideo) {
    return (
      <View style={styles.videoRoot}>
        <VideoCallView remoteName={displayName} localName="You" />
        <SafeAreaView
          style={[StyleSheet.absoluteFill, styles.overlay]}
          edges={['top', 'bottom']}
          pointerEvents="box-none">
          <View style={styles.videoHeader} pointerEvents="none">
            <Text style={styles.videoName}>{displayName}</Text>
            <Text style={styles.videoTimer}>{formatDuration(elapsed)}</Text>
          </View>
          <View style={styles.floatingControlsWrap}>{controls}</View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.audioContent}>
        <Text style={styles.label}>On call · {formatDuration(elapsed)}</Text>
        {remotePeers.length === 0 ? (
          <View style={styles.callee}>
            <Avatar name={displayName} size={120} />
            <Text style={styles.name}>{displayName}</Text>
          </View>
        ) : (
          <View style={styles.roster}>
            {remotePeers.map((peer) => {
              const name = peer.metadata?.peer?.displayName ?? displayName;
              const isTalking = speaking[peer.id] ?? false;
              return (
                <View key={peer.id} style={styles.rosterItem}>
                  <Avatar name={name} size={88} speaking={isTalking} />
                  <Text style={styles.rosterName}>{name}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
      <View style={styles.audioControlsWrap}>{controls}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BrandColors.seaBlue20 },

  // audio layout
  audioContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  label: {
    fontSize: 13,
    color: BrandColors.seaBlue100,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  callee: { alignItems: 'center', gap: 16, marginTop: 8 },
  name: { fontSize: 28, fontWeight: '700', color: TextColors.darkText },
  roster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 24,
    marginTop: 8,
  },
  rosterItem: { alignItems: 'center', gap: 8 },
  rosterName: { fontSize: 14, color: TextColors.darkText, fontWeight: '500' },
  audioControlsWrap: { paddingBottom: 24, alignItems: 'center' },

  // video layout (FaceTime style)
  videoRoot: { flex: 1, backgroundColor: BrandColors.darkBlue100 },
  overlay: { justifyContent: 'space-between' },
  videoHeader: { paddingTop: 8, alignItems: 'center' },
  videoName: { fontSize: 18, fontWeight: '700', color: AdditionalColors.white },
  videoTimer: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  floatingControlsWrap: { alignItems: 'center', paddingBottom: 12 },

  // shared control bar
  controls: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 40,
    alignItems: 'center',
  },
});

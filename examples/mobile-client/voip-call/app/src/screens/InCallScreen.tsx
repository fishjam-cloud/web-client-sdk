import {
  useAudioOutput,
  useMicrophone,
  usePeers,
  useVAD,
} from '@fishjam-cloud/react-native-client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useVoip } from '../voip';

type PeerMeta = { displayName?: string };

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function InCallScreen() {
  const { currentCall, endCall } = useVoip();
  const { toggleMicrophone, isMicrophoneOn } = useMicrophone();
  const isMicrophoneMuted = !isMicrophoneOn;
  const { remotePeers } = usePeers<PeerMeta>();
  const { currentAudioOutput, ios, android } = useAudioOutput();

  const peerIds = useMemo(() => remotePeers.map((p) => p.id), [remotePeers]);
  const speaking = useVAD({ peerIds });

  const isSpeaker = currentAudioOutput?.type === 'speaker';

  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!currentCall?.startedAt) {
      setElapsed(0);
      return;
    }
    const startedAt = currentCall.startedAt;
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [currentCall?.startedAt]);

  const toggleSpeaker = () => {
    if (Platform.OS === 'ios') {
      ios.overrideAudioOutput(isSpeaker ? 'none' : 'speaker');
    } else if (Platform.OS === 'android') {
      const target = isSpeaker ? null : currentAudioOutput;
      if (target) android.selectAudioOutput(target.id);
    }
  };

  const remoteName = currentCall?.remoteName ?? '…';

  return (
    <View style={styles.container}>
      <Text style={styles.label}>On call · {formatDuration(elapsed)}</Text>

      {remotePeers.length === 0 ? (
        <>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {remoteName[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <Text style={styles.name}>{remoteName}</Text>
        </>
      ) : (
        <View style={styles.roster}>
          {remotePeers.map((peer) => {
            const name = peer.metadata?.peer?.displayName ?? peer.id;
            const isTalking = speaking[peer.id] ?? false;
            return (
              <View
                key={peer.id}
                style={[
                  styles.rosterItem,
                  isTalking && styles.rosterItemSpeaking,
                ]}>
                <View
                  style={[
                    styles.rosterAvatar,
                    isTalking && styles.rosterAvatarSpeaking,
                  ]}>
                  <Text style={styles.rosterAvatarText}>
                    {name[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
                <Text style={styles.rosterName}>{name}</Text>
                {isTalking && <Text style={styles.speakingDot}>●</Text>}
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.controls}>
        <TouchableOpacity
          style={[
            styles.controlButton,
            isMicrophoneMuted && styles.controlButtonActive,
          ]}
          onPress={toggleMicrophone}>
          <Text style={styles.controlIcon}>
            {isMicrophoneMuted ? '🔇' : '🎤'}
          </Text>
          <Text style={styles.controlLabel}>
            {isMicrophoneMuted ? 'Unmute' : 'Mute'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endButton} onPress={endCall}>
          <Text style={styles.endIcon}>✕</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            isSpeaker && styles.controlButtonActive,
          ]}
          onPress={toggleSpeaker}>
          <Text style={styles.controlIcon}>{isSpeaker ? '🔊' : '🔈'}</Text>
          <Text style={styles.controlLabel}>
            {isSpeaker ? 'Earpiece' : 'Speaker'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#052e16',
    gap: 16,
    padding: 32,
  },
  label: {
    fontSize: 14,
    color: '#86efac',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  avatar: {
    marginVertical: 24,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 40, fontWeight: '700', color: '#fff' },
  name: { fontSize: 28, fontWeight: '700', color: '#fff' },
  roster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginVertical: 16,
  },
  rosterItem: {
    alignItems: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    minWidth: 80,
  },
  rosterItemSpeaking: { backgroundColor: 'rgba(22,163,74,0.25)' },
  rosterAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rosterAvatarSpeaking: { borderWidth: 2, borderColor: '#4ade80' },
  rosterAvatarText: { fontSize: 26, fontWeight: '700', color: '#fff' },
  rosterName: { fontSize: 13, color: '#d1fae5', textAlign: 'center' },
  speakingDot: { fontSize: 10, color: '#4ade80' },
  controls: {
    flexDirection: 'row',
    marginTop: 48,
    alignItems: 'center',
    gap: 32,
  },
  controlButton: {
    alignItems: 'center',
    gap: 6,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    minWidth: 80,
  },
  controlButtonActive: { backgroundColor: 'rgba(239,68,68,0.3)' },
  controlIcon: { fontSize: 28 },
  controlLabel: { fontSize: 12, color: '#d1fae5' },
  endButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endIcon: { fontSize: 28, color: '#fff' },
});

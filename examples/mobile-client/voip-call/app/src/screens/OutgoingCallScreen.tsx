import { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useVoip } from '../voip';

export function OutgoingCallScreen() {
  const { currentCall, endCall } = useVoip();
  const peerName = currentCall?.remoteName ?? '…';
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 800 }),
        withTiming(1, { duration: 800 }),
      ),
      -1,
    );
    return () => {
      scale.value = 1;
    };
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Calling</Text>
      <Animated.View style={[styles.avatarWrap, animatedStyle]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {peerName[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
      </Animated.View>
      <Text style={styles.name}>{peerName}</Text>

      <TouchableOpacity style={styles.endButton} onPress={endCall}>
        <Text style={styles.endIcon}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e1b4b',
    gap: 16,
    padding: 32,
  },
  label: {
    fontSize: 16,
    color: '#a5b4fc',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  avatarWrap: { marginVertical: 24 },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 40, fontWeight: '700', color: '#fff' },
  name: { fontSize: 28, fontWeight: '700', color: '#fff' },
  endButton: {
    marginTop: 48,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endIcon: { fontSize: 28, color: '#fff' },
});

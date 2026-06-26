import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, InCallButton } from '../components';
import { BrandColors, TextColors } from '../theme/colors';
import { useVoip } from '../voip';

export function OutgoingCallScreen() {
  const { currentCall, endCall } = useVoip();
  const displayName = currentCall?.displayName ?? '…';
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 800 }),
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.label}>Calling</Text>
        <Animated.View style={[styles.avatarWrap, animatedStyle]}>
          <Avatar name={displayName} size={120} />
        </Animated.View>
        <Text style={styles.name}>{displayName}</Text>
      </View>
      <View style={styles.controls}>
        <InCallButton
          type="disconnect"
          iconName="phone-hangup"
          onPress={endCall}
          accessibilityLabel="Cancel call"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BrandColors.seaBlue20 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  label: {
    fontSize: 13,
    color: BrandColors.seaBlue100,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  avatarWrap: { marginVertical: 24 },
  name: { fontSize: 28, fontWeight: '700', color: TextColors.darkText },
  controls: { paddingBottom: 32, alignItems: 'center' },
});

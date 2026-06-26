import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  type GestureResponderEvent,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';

import { AdditionalColors, BrandColors } from '../theme/colors';

type InCallButtonType = 'primary' | 'disconnect';

type InCallButtonProps = {
  type?: InCallButtonType;
  active?: boolean;
  onPress: (event: GestureResponderEvent) => void;
  iconName: keyof typeof MaterialCommunityIcons.glyphMap;
  accessibilityLabel?: string;
};

export function InCallButton({
  type = 'primary',
  active = false,
  onPress,
  iconName,
  accessibilityLabel,
}: InCallButtonProps) {
  const isDisconnect = type === 'disconnect';
  const filled = isDisconnect || active;

  const backgroundColor = isDisconnect
    ? AdditionalColors.red80
    : active
      ? BrandColors.darkBlue100
      : AdditionalColors.white;

  const iconColor = filled ? AdditionalColors.white : BrandColors.darkBlue100;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel={accessibilityLabel}
      style={[styles.button, { backgroundColor }, !filled && styles.outline]}>
      <MaterialCommunityIcons name={iconName} size={28} color={iconColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outline: {
    borderWidth: 1,
    borderColor: BrandColors.darkBlue80,
  },
});

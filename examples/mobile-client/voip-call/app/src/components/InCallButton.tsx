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
  disabled?: boolean;
};

export function InCallButton({
  type = 'primary',
  active = false,
  onPress,
  iconName,
  accessibilityLabel,
  disabled = false,
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
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.button,
        { backgroundColor },
        !filled && styles.outline,
        disabled && styles.disabled,
      ]}>
      <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outline: {
    borderWidth: 1,
    borderColor: BrandColors.darkBlue80,
  },
  disabled: { opacity: 0.45 },
});

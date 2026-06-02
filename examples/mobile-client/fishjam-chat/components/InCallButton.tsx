import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
  type GestureResponderEvent,
  StyleSheet,
  TouchableHighlight,
  View,
} from 'react-native';

import { AdditionalColors, BrandColors } from '../utils/Colors';

const IconSize = 25;

type ButtonTypeName = 'primary' | 'disconnect';

type InCallButtonProps = {
  type?: ButtonTypeName;
  onPress: (event: GestureResponderEvent) => void;
  iconName: keyof typeof MaterialCommunityIcons.glyphMap;
  accessibilityLabel?: string;
  disabled?: boolean;
};

export default function InCallButton({
  type = 'primary',
  onPress,
  iconName,
  accessibilityLabel,
  disabled = false,
}: InCallButtonProps) {
  const stylesForButtonType = [
    styles.common,
    type === 'primary' ? styles.primary : styles.disconnect,
  ];
  const buttonColor =
    type === 'primary' ? BrandColors.darkBlue100 : AdditionalColors.white;

  return (
    <TouchableHighlight
      onPress={onPress}
      disabled={disabled}
      style={[styles.common, disabled && styles.disabled]}
      accessibilityLabel={accessibilityLabel}>
      <View style={stylesForButtonType}>
        <MaterialCommunityIcons
          name={iconName}
          size={IconSize}
          color={buttonColor}
        />
      </View>
    </TouchableHighlight>
  );
}

const styles = StyleSheet.create({
  common: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  primary: {
    borderWidth: 1,
    borderColor: BrandColors.darkBlue80,
    borderStyle: 'solid',
    backgroundColor: AdditionalColors.white,
  },
  disconnect: {
    backgroundColor: AdditionalColors.red80,
  },
});

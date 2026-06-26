import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, TextColors } from '../theme/colors';

type AvatarProps = {
  name: string;
  size?: number;
  speaking?: boolean;
};

export function Avatar({ name, size = 96, speaking = false }: AvatarProps) {
  const initial = name.trim()[0]?.toUpperCase() ?? '?';
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: speaking ? 3 : 0,
        },
      ]}>
      <Text style={[styles.text, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: BrandColors.darkBlue60,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: BrandColors.seaBlue80,
  },
  text: {
    color: TextColors.white,
    fontWeight: '700',
  },
});

import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { BrandColors, TextColors } from '../theme/colors';

type AvatarProps = {
  name: string;
  /** Server-assigned avatar image; falls back to initials when null/absent or on error. */
  avatarUrl?: string | null;
  size?: number;
  speaking?: boolean;
};

export function Avatar({
  name,
  avatarUrl,
  size = 96,
  speaking = false,
}: AvatarProps) {
  const initial = name.trim()[0]?.toUpperCase() ?? '?';
  const [failed, setFailed] = useState(false);
  // Reset the error state if the URL changes (e.g. list refresh).
  useEffect(() => setFailed(false), [avatarUrl]);
  const showImage = Boolean(avatarUrl) && !failed;
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
      {/* Initials sit underneath as the fallback while the image loads or if it fails. */}
      <Text style={[styles.text, { fontSize: size * 0.4 }]}>{initial}</Text>
      {showImage && (
        <Image
          source={{ uri: avatarUrl! }}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: BrandColors.darkBlue60,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: BrandColors.seaBlue80,
    overflow: 'hidden',
  },
  text: {
    color: TextColors.white,
    fontWeight: '700',
  },
});

import { useConnection } from '@fishjam-cloud/react-native-client';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BrandColors } from '../utils/Colors';

export default function ReconnectionBanner() {
  const { reconnectionStatus } = useConnection();

  if (reconnectionStatus === 'idle') return null;

  return (
    <View
      style={[
        styles.banner,
        reconnectionStatus === 'error' ? styles.error : styles.warning,
      ]}>
      <Text style={styles.text}>
        {reconnectionStatus === 'reconnecting'
          ? 'Reconnecting…'
          : 'Connection lost'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  warning: {
    backgroundColor: '#FEF3C7',
  },
  error: {
    backgroundColor: '#FEE2E2',
  },
  text: {
    color: BrandColors.darkBlue100,
    fontWeight: '600',
    fontSize: 14,
  },
});

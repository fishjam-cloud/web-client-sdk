import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, TextInput } from '../../components';
import { useShowcaseSettings } from '../../context/ShowcaseSettingsContext';
import { BrandColors } from '../../utils/Colors';

export default function SettingsScreen() {
  const { providerSettings, setProviderSettings, bumpProviderRemount } =
    useShowcaseSettings();

  const [debug, setDebug] = useState(providerSettings.debug);
  const [reconnectEnabled, setReconnectEnabled] = useState(
    providerSettings.reconnectEnabled,
  );
  const [maxAttempts, setMaxAttempts] = useState(
    String(providerSettings.maxReconnectAttempts),
  );
  const [bandwidthKbps, setBandwidthKbps] = useState(
    providerSettings.singleStreamBandwidthBps != null
      ? String(Math.round(providerSettings.singleStreamBandwidthBps / 1000))
      : '',
  );

  const handleApply = () => {
    const parsedAttempts = Math.max(
      0,
      Math.min(99, parseInt(maxAttempts, 10) || 3),
    );
    const kb = bandwidthKbps.trim();
    const bps =
      kb === '' ? null : Math.max(1, parseInt(kb, 10) || 0) * 1000;

    setProviderSettings({
      debug,
      reconnectEnabled,
      maxReconnectAttempts: parsedAttempts,
      singleStreamBandwidthBps: bps,
    });
    bumpProviderRemount();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>FishjamProvider</Text>
        <Text style={styles.hint}>
          Saving reapplies SDK options and remounts the client (active calls
          disconnect).
        </Text>

        <View style={styles.row}>
          <Text style={styles.label}>Debug logging</Text>
          <Switch value={debug} onValueChange={setDebug} />
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Reconnection</Text>
          <Switch value={reconnectEnabled} onValueChange={setReconnectEnabled} />
        </View>

        <Text style={styles.label}>Max reconnect attempts</Text>
        <TextInput
          value={maxAttempts}
          onChangeText={setMaxAttempts}
          placeholder="5"
        />

        <Text style={styles.label}>
          Max video bitrate (kbps, empty = default)
        </Text>
        <TextInput
          value={bandwidthKbps}
          onChangeText={setBandwidthKbps}
          placeholder="e.g. 1500"
        />

        <View style={styles.spacer} />
        <Button title="Save and remount SDK" onPress={handleApply} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BrandColors.seaBlue20,
  },
  scroll: {
    padding: 20,
    gap: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: BrandColors.darkBlue100,
  },
  hint: {
    fontSize: 13,
    color: BrandColors.darkBlue80,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: BrandColors.darkBlue100,
    flexShrink: 1,
  },
  spacer: {
    height: 8,
  },
});

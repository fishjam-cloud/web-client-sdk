import { FishjamProvider } from '@fishjam-cloud/react-native-client';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import {
  ShowcaseSettingsProvider,
  useShowcaseSettings,
} from '../context/ShowcaseSettingsContext';
import {
  clearFishjamIdChangeCallback,
  setFishjamIdChangeCallback,
} from '../utils/fishjamIdStore';

const DEFAULT_FISHJAM_ID = process.env.EXPO_PUBLIC_FISHJAM_ID ?? '';

function FishjamStack() {
  const { providerSettings, providerRemountToken } = useShowcaseSettings();
  const [fishjamId, setFishjamId] = useState<string>(DEFAULT_FISHJAM_ID);

  useEffect(() => {
    setFishjamIdChangeCallback(setFishjamId);
    return () => {
      clearFishjamIdChangeCallback();
    };
  }, []);

  useEffect(() => {
    if (!fishjamId) {
      console.error(
        'Fishjam ID is not set. Set EXPO_PUBLIC_FISHJAM_ID or enter Fishjam ID on the Livestream tab.',
      );
    }
  }, [fishjamId]);

  const bandwidthLimits =
    providerSettings.singleStreamBandwidthBps != null
      ? { singleStream: providerSettings.singleStreamBandwidthBps }
      : undefined;

  return (
    <FishjamProvider
      key={providerRemountToken}
      fishjamId={fishjamId}
      reconnect={
        providerSettings.reconnectEnabled
          ? { maxAttempts: providerSettings.maxReconnectAttempts }
          : false
      }
      debug={providerSettings.debug}
      bandwidthLimits={bandwidthLimits}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ title: 'Home' }} />
        <Stack.Screen
          name="livestream/viewer"
          options={{
            headerShown: true,
            title: 'Viewer',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="livestream/streamer"
          options={{
            headerShown: true,
            title: 'Streamer',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="livestream/screen-sharing"
          options={{
            headerShown: true,
            title: 'Screen Sharing',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="room/preview"
          options={{
            headerShown: true,
            title: 'Preview',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="room/[roomName]"
          options={{
            headerShown: true,
            title: 'Room',
            headerBackTitle: 'Back',
          }}
        />
      </Stack>
    </FishjamProvider>
  );
}

export default function RootLayout() {
  return (
    <ShowcaseSettingsProvider>
      <FishjamStack />
    </ShowcaseSettingsProvider>
  );
}

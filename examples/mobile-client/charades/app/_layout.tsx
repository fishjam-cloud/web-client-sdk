import { FishjamProvider, Variant } from '@fishjam-cloud/react-native-client';
import { Stack } from 'expo-router';
import { useEffect } from 'react';

const FISHJAM_ID = process.env.EXPO_PUBLIC_FISHJAM_ID ?? '';

export default function RootLayout() {
  useEffect(() => {
    if (!FISHJAM_ID) {
      console.error(
        'Fishjam ID is not set. Please set the EXPO_PUBLIC_FISHJAM_ID environment variable.',
      );
    }
  }, []);

  return (
    <FishjamProvider
      fishjamId={FISHJAM_ID}
      videoConfig={{
        sentQualities: [
          Variant.VARIANT_LOW,
          Variant.VARIANT_MEDIUM,
          Variant.VARIANT_HIGH,
        ],
      }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ title: 'Charades' }} />
      </Stack>
    </FishjamProvider>
  );
}

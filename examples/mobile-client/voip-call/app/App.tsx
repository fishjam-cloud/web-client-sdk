import {
  FishjamProvider,
  useSandbox,
} from '@fishjam-cloud/react-native-client';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import type { PropsWithChildren } from 'react';
import { DirectoryScreen } from './src/screens/DirectoryScreen';
import { InCallScreen } from './src/screens/InCallScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OutgoingCallScreen } from './src/screens/OutgoingCallScreen';
import { UserProvider, useUser } from './src/user';
import { VoipProvider, useVoip } from './src/voip';

const SERVER_URL =
  process.env.EXPO_PUBLIC_VOIP_SERVER_URL ?? 'http://localhost:4400';
const SANDBOX_API_URL = process.env.EXPO_PUBLIC_SANDBOX_API_URL ?? '';

function VoipWrapper({ children }: PropsWithChildren) {
  const { username } = useUser();
  const { getSandboxPeerToken } = useSandbox({
    sandboxApiUrl: SANDBOX_API_URL,
  });

  const getPeerToken = useCallback(
    (roomName: string) =>
      getSandboxPeerToken(roomName, username ?? '', 'audio_only'),
    [getSandboxPeerToken, username],
  );

  const requestCall = useCallback(
    async ({ to, roomName }: { to: string; roomName: string }) => {
      const res = await fetch(`${SERVER_URL}/call`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from: username, to, roomName }),
      });
      if (!res.ok) throw new Error('Failed to initiate call');
    },
    [username],
  );

  return (
    <VoipProvider getPeerToken={getPeerToken} requestCall={requestCall}>
      <DeviceRegistration />
      {children}
    </VoipProvider>
  );
}

function DeviceRegistration() {
  const { username } = useUser();
  const { voipToken } = useVoip();

  useEffect(() => {
    if (!username || !voipToken) return;
    fetch(`${SERVER_URL}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, voipToken }),
    }).catch(() => {});
  }, [username, voipToken]);

  return null;
}

function AppScreens() {
  const { username } = useUser();
  const { status, currentCall } = useVoip();

  if (!username) {
    return <LoginScreen />;
  }

  if (status === 'connecting') {
    if (currentCall?.direction === 'outgoing') {
      return <OutgoingCallScreen />;
    }
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (status === 'active') {
    return <InCallScreen />;
  }

  // available | incoming — directory is shown underneath;
  // for 'incoming' the native CallKit sheet covers the screen anyway
  return <DirectoryScreen />;
}

const App = () => (
  <FishjamProvider fishjamId={process.env.EXPO_PUBLIC_FISHJAM_ID ?? ''}>
    <SafeAreaProvider>
      <UserProvider>
        <VoipWrapper>
          <SafeAreaView style={styles.safeArea}>
            <StatusBar style="auto" />
            <AppScreens />
          </SafeAreaView>
        </VoipWrapper>
      </UserProvider>
    </SafeAreaProvider>
  </FishjamProvider>
);

export default App;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

import {
  FishjamProvider,
  useCameraPermissions,
  useMicrophonePermissions,
  useSandbox,
} from '@fishjam-cloud/react-native-client';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { PropsWithChildren } from 'react';
import { DirectoryScreen } from './src/screens/DirectoryScreen';
import { InCallScreen } from './src/screens/InCallScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OutgoingCallScreen } from './src/screens/OutgoingCallScreen';
import { BrandColors } from './src/theme/colors';
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
      getSandboxPeerToken(roomName, username ?? 'unknown', 'conference'),
    [getSandboxPeerToken, username],
  );

  const requestCall = useCallback(
    async ({
      to,
      roomName,
      isVideo,
    }: {
      to: string;
      roomName: string;
      isVideo: boolean;
    }) => {
      const res = await fetch(`${SERVER_URL}/call`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from: username, to, roomName, isVideo }),
      });
      if (!res.ok) throw new Error('Failed to initiate call');
    },
    [username],
  );

  return (
    <VoipProvider
      getPeerToken={getPeerToken}
      requestCall={requestCall}
      isVideo={true}>
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

function requestPermissions() {
  const [, requestCamera] = useCameraPermissions();
  const [, requestMicrophone] = useMicrophonePermissions();

  useEffect(() => {
    (async () => {
      const microphoneStatus = await requestMicrophone();
      if (microphoneStatus !== 'granted') {
        throw new Error('Microphone permission not granted');
      }
      const cameraStatus = await requestCamera();
      if (cameraStatus !== 'granted') {
        throw new Error('Camera permission not granted');
      }
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      }
    })();
  }, [requestCamera, requestMicrophone]);
}

function AppScreens() {
  const { username, isLoading } = useUser();
  const { status } = useVoip();
  requestPermissions();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BrandColors.darkBlue80} />
      </View>
    );
  }

  if (!username) {
    return <LoginScreen />;
  }

  if (status === 'connecting') {
    return <OutgoingCallScreen />;
  }

  if (status === 'active') {
    return <InCallScreen />;
  }

  return <DirectoryScreen />;
}

const App = () => (
  <FishjamProvider fishjamId={process.env.EXPO_PUBLIC_FISHJAM_ID ?? ''}>
    <SafeAreaProvider>
      <UserProvider>
        <VoipWrapper>
          <View style={styles.root}>
            <StatusBar style="auto" />
            <AppScreens />
          </View>
        </VoipWrapper>
      </UserProvider>
    </SafeAreaProvider>
  </FishjamProvider>
);

export default App;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BrandColors.seaBlue20 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.seaBlue20,
  },
});

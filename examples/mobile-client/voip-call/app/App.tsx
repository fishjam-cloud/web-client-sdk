import {
  FishjamProvider,
  useCameraPermissions,
  useMicrophonePermissions,
  useSandbox,
} from '@fishjam-cloud/react-native-client';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { VoipIncomingPayload } from '@fishjam-cloud/react-native-client';
import type { PropsWithChildren } from 'react';
import { InCallScreen } from './src/screens/InCallScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OutgoingCallScreen } from './src/screens/OutgoingCallScreen';
import { UsersScreen } from './src/screens/UsersScreen';
import { useCallSignaling } from './src/signaling/useCallSignaling';
import { BrandColors } from './src/theme/colors';
import { UserProvider, useUser } from './src/user';
import { VoipProvider, useVoip } from './src/voip';

const SERVER_URL =
  process.env.EXPO_PUBLIC_VOIP_SERVER_URL ?? 'http://localhost:4400';
const SANDBOX_API_URL = process.env.EXPO_PUBLIC_SANDBOX_API_URL ?? '';

// Thin wrapper that calls the signaling hook.
// Must be inside VoipProvider so useCallSignaling can access useVoip().
function CallSignaling({
  username,
  sendSignalRef,
}: {
  username: string | null;
  sendSignalRef: MutableRefObject<
    ((msg: Record<string, unknown>) => void) | undefined
  >;
}) {
  useCallSignaling({ serverUrl: SERVER_URL, username, sendSignalRef });
  return null;
}

function VoipWrapper({ children }: PropsWithChildren) {
  const { username } = useUser();
  const sendSignalRef = useRef<
    ((msg: Record<string, unknown>) => void) | undefined
  >(undefined);

  const onWaitingCallDeclined = useCallback((payload: VoipIncomingPayload) => {
    sendSignalRef.current?.({
      type: 'call-rejected',
      to: payload.displayName,
      roomName: payload.roomName,
    });
  }, []);

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
      onWaitingCallDeclined={onWaitingCallDeclined}
      isVideo={true}
      canStartOutgoingCall={Boolean(username)}>
      <DeviceRegistration />
      <CallEndedLogger />
      <CallSignaling username={username} sendSignalRef={sendSignalRef} />
      {children}
    </VoipProvider>
  );
}

function CallEndedLogger() {
  const { lastEndedReason } = useVoip();
  const { username } = useUser();

  useEffect(() => {
    if (!lastEndedReason) return;
    console.log(
      `On user: ${username}, [VoIP] Call ended — reason: ${lastEndedReason}`,
    );
  }, [lastEndedReason, username]);

  return null;
}

function DeviceRegistration() {
  const { username } = useUser();
  const { voipToken } = useVoip();

  useEffect(() => {
    if (!username || !voipToken) return;
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    fetch(`${SERVER_URL}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, voipToken, platform: Platform.OS }),
    }).catch(() => {});
  }, [username, voipToken]);

  return null;
}

function useRequestPermissions() {
  const [, requestCamera] = useCameraPermissions();
  const [, requestMicrophone] = useMicrophonePermissions();

  useEffect(() => {
    (async () => {
      const microphoneStatus = await requestMicrophone();
      if (microphoneStatus !== 'granted') {
        console.warn('Microphone permission not granted — calls will be muted');
      }
      const cameraStatus = await requestCamera();
      if (cameraStatus !== 'granted') {
        console.warn('Camera permission not granted — video will be disabled');
      }
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      }
    })().catch((err) => console.error('Failed to request permissions:', err));
  }, [requestCamera, requestMicrophone]);
}

function AppScreens() {
  const { username, isLoading } = useUser();
  const { status } = useVoip();
  useRequestPermissions();

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

  return <UsersScreen />;
}

const App = () => (
  <FishjamProvider fishjamId={process.env.EXPO_PUBLIC_FISHJAM_ID ?? ''}>
    <SafeAreaProvider>
      <UserProvider>
        <VoipWrapper>
          <View style={styles.root}>
            <StatusBar style="dark" />
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

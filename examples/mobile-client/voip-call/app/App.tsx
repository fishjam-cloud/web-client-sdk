import {
  FishjamProvider,
  useVoIP,
  VoIPProvider,
} from '@fishjam-cloud/react-native-client';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { VoIPIncomingPayload } from '@fishjam-cloud/react-native-client';
import {
  useCallSignaling,
  type SendSignalRef,
} from './src/hooks/useCallSignaling';
import { useDeviceRegistration } from './src/hooks/useDeviceRegistration';
import { useRecentsRedial } from './src/hooks/useRecentsRedial';
import { useRequestPermissions } from './src/hooks/useRequestPermissions';
import { CallScreen } from './src/screens/CallScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { UsersScreen } from './src/screens/UsersScreen';
import { BrandColors } from './src/theme/colors';
import { useUser } from './src/user/UserContext';
import { UserProvider } from './src/user/UserProvider';

function Main({ sendSignalRef }: { sendSignalRef: SendSignalRef }) {
  const { username, isLoading } = useUser();
  const { callStatus, lastEndedReason } = useVoIP();

  useRequestPermissions();
  useCallSignaling(sendSignalRef);
  useDeviceRegistration();
  useRecentsRedial();

  useEffect(() => {
    if (!lastEndedReason) return;
    console.log(
      `On user: ${username}, [VoIP] Call ended — reason: ${lastEndedReason}`,
    );
  }, [lastEndedReason, username]);

  // Checked before the session gates below: a call can exist while the user session
  // is still loading (answering a VoIP push right after a cold start) or missing
  // (still registered for pushes after a logout), and it must connect regardless.
  if (callStatus === 'connecting' || callStatus === 'active') {
    return <CallScreen />;
  }

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

  return <UsersScreen />;
}

function VoIPApp() {
  const sendSignalRef: SendSignalRef = useRef(undefined);

  // A call we declined while another one was ringing never reaches the callee's
  // signaling flow, so tell the caller ourselves.
  const onWaitingCallDeclined = useCallback((payload: VoIPIncomingPayload) => {
    sendSignalRef.current?.({
      type: 'call-rejected',
      to: payload.handle,
      roomName: payload.roomName,
    });
  }, []);

  return (
    <FishjamProvider fishjamId={process.env.EXPO_PUBLIC_FISHJAM_ID ?? ''}>
      <VoIPProvider onWaitingCallDeclined={onWaitingCallDeclined} isVideo>
        <View style={styles.root}>
          <StatusBar style="dark" />
          <Main sendSignalRef={sendSignalRef} />
        </View>
      </VoIPProvider>
    </FishjamProvider>
  );
}

const App = () => (
  <SafeAreaProvider>
    <UserProvider>
      <VoIPApp />
    </UserProvider>
  </SafeAreaProvider>
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

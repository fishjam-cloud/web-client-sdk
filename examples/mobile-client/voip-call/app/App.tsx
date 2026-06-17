import { FishjamProvider } from '@fishjam-cloud/react-native-client';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import { Button, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useCallKit } from '@fishjam-cloud/react-native-webrtc';
import { useCallKitEvent } from './src/callkit';

const EventLog = () => {
  // TODO: Implement on the native side.
  const { reportIncomingCall } = useCallKit();

  useCallKitEvent(
    'incoming',
    useCallback((payload) => {}, []),
  );
  useCallKitEvent(
    'answer',
    useCallback((payload) => {}, []),
  );
  useCallKitEvent(
    'end',
    useCallback((payload) => {}, []),
  );
  useCallKitEvent(
    'registered',
    useCallback((payload) => {}, []),
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>CallKit events</Text>
      <Button
        title="Report incoming call"
        onPress={() =>
          setTimeout(() => reportIncomingCall('Test', false), 3000)
        }
      />
    </SafeAreaView>
  );
};

const App = () => (
  <FishjamProvider fishjamId={process.env.EXPO_PUBLIC_FISHJAM_ID ?? ''}>
    <SafeAreaProvider>
      <EventLog />
    </SafeAreaProvider>
  </FishjamProvider>
);

export default App;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '600' },
  log: { flex: 1, borderTopColor: '#EAECF0', borderTopWidth: 1 },
  logContent: { paddingTop: 12, gap: 6 },
  muted: { color: 'gray' },
  line: { fontFamily: 'Courier', fontSize: 14 },
});

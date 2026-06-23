import { FishjamProvider } from '@fishjam-cloud/react-native-client';
import {
  useVoIPEvents,
  type VoipIncomingPayload,
} from '@fishjam-cloud/react-native-webrtc';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const EventLog = () => {
  useVoIPEvents({
    onIncoming: (payload: VoipIncomingPayload) => {
      console.log('onIncoming', payload);
    },
    onAnswered: () => {
      console.log('onAnswered');
    },
    onEnded: () => {
      console.log('onEnded');
    },
    onRegistered: (token: string) => {
      console.log('onRegistered', token);
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>CallKit events</Text>
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

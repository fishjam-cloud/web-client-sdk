import {
  getVoipToken,
  useTelecom,
  useTelecomEvent,
  type TelecomEvent,
} from '@fishjam-cloud/react-native-webrtc';
import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

/**
 * Throwaway dev screen to exercise the Android Telecom native path directly,
 * before it's wired into VoipProvider. Renders a floating button that opens a
 * panel with the raw Telecom controls + a live event log.
 */
async function ensureNotificationPermission() {
  if (Platform.OS !== 'android' || Platform.Version < 33) return;
  try {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
  } catch {
    // ignore — the user can grant it manually via adb / settings
  }
}

export function TelecomTestScreen() {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [state, setState] = useState({ hasActiveCall: false, isAnswered: false });

  const {
    startCall,
    reportIncomingCall,
    answerCall,
    setCallActive,
    endCall,
    hasActiveCall,
    isAnswered,
  } = useTelecom();

  const append = useCallback((line: string) => {
    const stamp = new Date().toLocaleTimeString();
    setLog((prev) => [`${stamp}  ${line}`, ...prev].slice(0, 40));
  }, []);

  const refreshState = useCallback(() => {
    setState({ hasActiveCall: hasActiveCall(), isAnswered: isAnswered() });
  }, [hasActiveCall, isAnswered]);

  useTelecomEvent(
    useCallback(
      (e: TelecomEvent) => {
        append(`event → ${JSON.stringify(e)}`);
        refreshState();
      },
      [append, refreshState],
    ),
  );

  useEffect(() => {
    getVoipToken().then((token) =>
      console.log('[voip] FCM installation id =', token),
    );
  }, []);

  useEffect(() => {
    if (open) {
      ensureNotificationPermission();
      refreshState();
    }
  }, [open, refreshState]);

  const run = (label: string, fn: () => Promise<void>) => async () => {
    try {
      await fn();
      append(`${label} → ok`);
    } catch (err) {
      append(`${label} FAILED: ${(err as Error)?.message ?? err}`);
    }
    refreshState();
  };

  return (
    <>
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setOpen(true)}
        accessibilityLabel="Open Telecom test panel">
        <Text style={styles.fabText}>☎︎</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Telecom native test</Text>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.stateRow}>
            <Text style={styles.stateText}>
              hasActiveCall: {String(state.hasActiveCall)}
            </Text>
            <Text style={styles.stateText}>
              isAnswered: {String(state.isAnswered)}
            </Text>
            <Pressable onPress={refreshState}>
              <Text style={styles.refresh}>↻</Text>
            </Pressable>
          </View>

          <View style={styles.buttons}>
            <Btn
              label="Incoming (ring)"
              onPress={run('reportIncomingCall', () =>
                reportIncomingCall({ displayName: 'Alice', isVideo: false }),
              )}
            />
            <Btn label="Answer" onPress={run('answerCall', answerCall)} />
            <Btn
              label="Outgoing"
              onPress={run('startCall', () =>
                startCall({ displayName: 'Bob', isVideo: false }),
              )}
            />
            <Btn
              label="Set Active (picked up)"
              onPress={run('setCallActive', setCallActive)}
            />
            <Btn label="End / Decline" onPress={run('endCall', endCall)} />
          </View>

          <Text style={styles.logTitle}>Event log</Text>
          <ScrollView style={styles.logBox} contentContainerStyle={styles.logContent}>
            {log.map((line, i) => (
              <Text key={i} style={styles.logLine}>
                {line}
              </Text>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress}>
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 32,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    zIndex: 999,
  },
  fabText: { color: '#fff', fontSize: 24 },
  container: { flex: 1, backgroundColor: '#0B1220', padding: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 12,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '600' },
  close: { color: '#93C5FD', fontSize: 16 },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  stateText: { color: '#E5E7EB', fontFamily: 'monospace', fontSize: 12 },
  refresh: { color: '#93C5FD', fontSize: 18 },
  buttons: { gap: 8 },
  btn: {
    backgroundColor: '#1F2937',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontSize: 15, textAlign: 'center' },
  logTitle: { color: '#9CA3AF', marginTop: 16, marginBottom: 6, fontSize: 13 },
  logBox: { flex: 1, backgroundColor: '#111827', borderRadius: 6 },
  logContent: { padding: 8 },
  logLine: {
    color: '#93C5FD',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    marginBottom: 2,
  },
});

import { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useUser } from '../user';
import { useVoip } from '../voip';

function makeRoomName() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `voip-${id}`;
}

export function DirectoryScreen() {
  const { username, users, refreshUsers } = useUser();
  const { status, startCall } = useVoip();
  const isCalling = status === 'connecting' || status === 'active';

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  const handleCall = async (to: string) => {
    try {
      await startCall(to, makeRoomName());
    } catch (err) {
      console.error('Failed to start call:', err);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Directory</Text>
        <Text style={styles.me}>Signed in as {username}</Text>
      </View>
      <FlatList
        data={users}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={refreshUsers} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No other users online yet.</Text>
            <Text style={styles.emptyHint}>
              Ask someone else to open the app.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, isCalling && styles.rowDisabled]}
            onPress={() => handleCall(item)}
            disabled={isCalling}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item[0]?.toUpperCase()}</Text>
            </View>
            <Text style={styles.name}>{item}</Text>
            {isCalling ? (
              <ActivityIndicator size="small" color="#6366f1" />
            ) : (
              <Text style={styles.callIcon}>📞</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    padding: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  me: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    gap: 12,
  },
  rowDisabled: { opacity: 0.6 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '600', color: '#6366f1' },
  name: { flex: 1, fontSize: 16, color: '#111827' },
  callIcon: { fontSize: 20 },
  empty: { paddingTop: 48, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '500', color: '#374151' },
  emptyHint: { fontSize: 14, color: '#9ca3af' },
});

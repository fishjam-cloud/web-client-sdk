import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../components';
import { AdditionalColors, BrandColors, TextColors } from '../theme/colors';
import { useUser } from '../user';
import { useVoip } from '../voip';

// Random room name for the call
function makeRoomName() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `voip-${id}`;
}

export function DirectoryScreen() {
  const { username, users, refreshUsers, logout } = useUser();
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Directory</Text>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => logout()}
            accessibilityLabel="Log out">
            <MaterialCommunityIcons
              name="logout"
              size={16}
              color={AdditionalColors.red80}
            />
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.me}>Signed in as {username}</Text>
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={refreshUsers}
            tintColor={BrandColors.darkBlue80}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons
              name="account-multiple-outline"
              size={48}
              color={BrandColors.darkBlue60}
            />
            <Text style={styles.emptyText}>No other users online yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, isCalling && styles.rowDisabled]}
            onPress={() => handleCall(item)}
            disabled={isCalling}
            activeOpacity={0.7}>
            <Avatar name={item} size={44} />
            <Text style={styles.name}>{item}</Text>
            {isCalling ? (
              <ActivityIndicator size="small" color={BrandColors.darkBlue80} />
            ) : (
              <MaterialCommunityIcons
                name="phone"
                size={22}
                color={BrandColors.seaBlue100}
              />
            )}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BrandColors.seaBlue20 },
  header: {
    padding: 24,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 28, fontWeight: '700', color: TextColors.darkText },
  me: { fontSize: 14, color: AdditionalColors.grey80, marginTop: 2 },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 100,
    backgroundColor: AdditionalColors.white,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: AdditionalColors.red80,
  },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    backgroundColor: AdditionalColors.white,
    gap: 12,
  },
  rowDisabled: { opacity: 0.5 },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: TextColors.darkText,
  },
  empty: { paddingTop: 64, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 16, fontWeight: '600', color: BrandColors.darkBlue80 },
  emptyHint: { fontSize: 14, color: AdditionalColors.grey80 },
});

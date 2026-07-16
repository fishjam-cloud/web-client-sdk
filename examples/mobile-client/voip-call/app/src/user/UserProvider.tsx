import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { UserContext, type UserSummary } from './UserContext';

const SERVER_URL =
  process.env.EXPO_PUBLIC_VOIP_SERVER_URL ?? 'http://localhost:4400';
const USERNAME_STORAGE_KEY = 'voip.username';

export function UserProvider({ children }: PropsWithChildren) {
  const [username, setUsername] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<UserSummary[]>([]);
  // `true` while we read the persisted session on startup, so the UI can avoid
  // flashing the login screen before a saved username is restored.
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/users?exclude=`);
      if (!res.ok) return;
      const list: UserSummary[] = await res.json();
      setAllUsers(list);
    } catch {
      // network error — ignore
    }
  }, []);

  const register = useCallback(
    async (name: string) => {
      setUsername(name);
      await AsyncStorage.setItem(USERNAME_STORAGE_KEY, name);
      await fetchUsers();
    },
    [fetchUsers],
  );

  const refreshUsers = useCallback(async () => {
    if (username) await fetchUsers();
  }, [username, fetchUsers]);

  const logout = useCallback(async () => {
    setUsername(null);
    setAllUsers([]);
    await AsyncStorage.removeItem(USERNAME_STORAGE_KEY);
  }, []);

  // Restore the persisted session on startup so a reload keeps the user logged in.
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(USERNAME_STORAGE_KEY);
        if (saved) {
          setUsername(saved);
          await fetchUsers();
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [fetchUsers]);

  const users = useMemo(
    () => allUsers.filter((u) => u.username !== username),
    [allUsers, username],
  );

  const avatarUrlFor = useCallback(
    (name: string) =>
      allUsers.find((u) => u.username === name)?.avatarUrl ?? null,
    [allUsers],
  );

  const value = useMemo(
    () => ({
      username,
      users,
      isLoading,
      register,
      refreshUsers,
      logout,
      avatarUrlFor,
    }),
    [username, users, isLoading, register, refreshUsers, logout, avatarUrlFor],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { UserContext } from './UserContext';

const SERVER_URL = process.env.EXPO_PUBLIC_VOIP_SERVER_URL ?? 'http://localhost:4400';
const USERNAME_STORAGE_KEY = 'voip.username';

export function UserProvider({ children }: PropsWithChildren) {
  const [username, setUsername] = useState<string | null>(null);
  const [users, setUsers] = useState<string[]>([]);
  // `true` while we read the persisted session on startup, so the UI can avoid
  // flashing the login screen before a saved username is restored.
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = useCallback(async (exclude: string) => {
    try {
      const res = await fetch(`${SERVER_URL}/users?exclude=${encodeURIComponent(exclude)}`);
      if (!res.ok) return;
      const list: string[] = await res.json();
      setUsers(list);
    } catch {
      // network error — ignore
    }
  }, []);

  const register = useCallback(
    async (name: string) => {
      setUsername(name);
      await AsyncStorage.setItem(USERNAME_STORAGE_KEY, name);
      await fetchUsers(name);
    },
    [fetchUsers],
  );

  const refreshUsers = useCallback(async () => {
    if (username) await fetchUsers(username);
  }, [username, fetchUsers]);

  const logout = useCallback(async () => {
    setUsername(null);
    setUsers([]);
    await AsyncStorage.removeItem(USERNAME_STORAGE_KEY);
  }, []);

  // Restore the persisted session on startup so a reload keeps the user logged in.
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(USERNAME_STORAGE_KEY);
        if (saved) {
          setUsername(saved);
          await fetchUsers(saved);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [fetchUsers]);

  const value = useMemo(
    () => ({ username, users, isLoading, register, refreshUsers, logout }),
    [username, users, isLoading, register, refreshUsers, logout],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

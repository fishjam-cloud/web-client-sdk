import React, { type PropsWithChildren, useCallback, useMemo, useState } from 'react';

import { UserContext } from './UserContext';

const SERVER_URL = process.env.EXPO_PUBLIC_VOIP_SERVER_URL ?? 'http://localhost:4400';

export function UserProvider({ children }: PropsWithChildren) {
  const [username, setUsername] = useState<string | null>(null);
  const [users, setUsers] = useState<string[]>([]);

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
      await fetchUsers(name);
    },
    [fetchUsers],
  );

  const refreshUsers = useCallback(async () => {
    if (username) await fetchUsers(username);
  }, [username, fetchUsers]);

  const value = useMemo(
    () => ({ username, users, register, refreshUsers }),
    [username, users, register, refreshUsers],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

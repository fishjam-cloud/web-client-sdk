import { createContext, useContext } from 'react';

export type UserContextValue = {
  username: string | null;
  users: string[];
  register: (name: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
};

export const UserContext = createContext<UserContextValue | null>(null);

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}

import { createContext, useContext } from 'react';

export type UserSummary = {
  username: string;
  avatarUrl: string | null;
};

export type UserContextValue = {
  username: string | null;
  users: UserSummary[];
  isLoading: boolean;
  register: (name: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
  logout: () => Promise<void>;
  avatarUrlFor: (name: string) => string | null;
};

export const UserContext = createContext<UserContextValue | null>(null);

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}

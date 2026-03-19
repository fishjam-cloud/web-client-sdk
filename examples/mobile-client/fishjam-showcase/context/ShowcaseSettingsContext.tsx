import React, { createContext, useContext, useMemo, useState } from 'react';

export type ShowcaseProviderSettings = {
  debug: boolean;
  reconnectEnabled: boolean;
  maxReconnectAttempts: number;
  singleStreamBandwidthBps: number | null;
};

const defaultSettings: ShowcaseProviderSettings = {
  debug: false,
  reconnectEnabled: true,
  maxReconnectAttempts: 5,
  singleStreamBandwidthBps: null,
};

type ShowcaseSettingsContextValue = {
  providerSettings: ShowcaseProviderSettings;
  setProviderSettings: React.Dispatch<
    React.SetStateAction<ShowcaseProviderSettings>
  >;
  providerRemountToken: number;
  bumpProviderRemount: () => void;
};

const ShowcaseSettingsContext = createContext<ShowcaseSettingsContextValue | null>(
  null,
);

export function ShowcaseSettingsProvider({
  children,
}: React.PropsWithChildren) {
  const [providerSettings, setProviderSettings] =
    useState<ShowcaseProviderSettings>(defaultSettings);
  const [providerRemountToken, setProviderRemountToken] = useState(0);

  const bumpProviderRemount = () => {
    setProviderRemountToken((t) => t + 1);
  };

  const value = useMemo(
    () => ({
      providerSettings,
      setProviderSettings,
      providerRemountToken,
      bumpProviderRemount,
    }),
    [providerSettings, providerRemountToken],
  );

  return (
    <ShowcaseSettingsContext.Provider value={value}>
      {children}
    </ShowcaseSettingsContext.Provider>
  );
}

export function useShowcaseSettings() {
  const ctx = useContext(ShowcaseSettingsContext);
  if (!ctx) {
    throw new Error('useShowcaseSettings must be used within ShowcaseSettingsProvider');
  }
  return ctx;
}

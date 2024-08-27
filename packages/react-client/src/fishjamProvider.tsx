import type { PropsWithChildren } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Client } from "./Client";
import { useTrackManager } from "./trackManager";
import type { DeviceManagerConfig, ScreenshareState } from "./types";
import { useClientState } from "./hooks/clientState";
import type { ReconnectConfig } from "@fishjam-cloud/ts-client";
import { FishjamContext } from "./hooks/fishjamContext";
import { useForceRerender } from "./hooks/forceRerender";

interface FishjamProviderProps extends PropsWithChildren {
  config?: { reconnect?: ReconnectConfig | boolean };
  deviceManagerDefaultConfig?: DeviceManagerConfig;
}

export function FishjamProvider({ children, config, deviceManagerDefaultConfig }: FishjamProviderProps) {
  const client = useRef(
    new Client({
      clientConfig: config,
      deviceManagerDefaultConfig,
    }),
  );

  const forceRerender = useForceRerender();

  useEffect(() => {
    console.warn("Fishjam config changed. Client has been reset.");
    client.current = new Client({ clientConfig: config, deviceManagerDefaultConfig });
    forceRerender();
  }, [config, forceRerender]);

  useEffect(() => {
    if (!deviceManagerDefaultConfig) return;
    client.current.setDeviceManagerConfig(deviceManagerDefaultConfig);
  }, [deviceManagerDefaultConfig]);

  const state = useClientState(client.current);

  const tsClient = client.current.getTsClient();

  const screenshareState = useState<ScreenshareState>(null);

  const videoTrackManager = useTrackManager({
    mediaManager: client.current.videoDeviceManager,
    tsClient,
  });

  const audioTrackManager = useTrackManager({
    mediaManager: client.current.audioDeviceManager,
    tsClient,
  });

  return (
    <FishjamContext.Provider value={{ state, screenshareState, videoTrackManager, audioTrackManager }}>
      {children}
    </FishjamContext.Provider>
  );
}

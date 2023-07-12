import React, { useCallback, useContext, useMemo, useState } from "react";
import { PeerApi, RoomApi } from "../server-sdk";
import axios from "axios";
import { useLocalStorageStateString } from "./LogSelector";

const LOCAL_STORAGE_HOST_KEY = "host";
const LOCAL_STORAGE_PROTOCOL_KEY = "signaling-protocol";
const LOCAL_STORAGE_PATH_KEY = "signaling-path";

export type ServerSdkType = {
  setSignalingHost: (value: string) => void;
  signalingHost: string | null;

  setSignalingProtocol: (value: string) => void;
  signalingProtocol: string | null;

  setSignalingPath: (value: string) => void;
  signalingPath: string | null;

  // todo refactor
  serverMessagesWebsocket: string | null;
  roomApi: RoomApi | null;
  peerApi: PeerApi | null;
  serverToken: string | null;
  setServerToken: (value: string | null) => void;
};

const ServerSdkContext = React.createContext<ServerSdkType | undefined>(undefined);

type Props = {
  children: React.ReactNode;
};

export const ServerSDKProvider = ({ children }: Props) => {
  const [host, setHost] = useLocalStorageStateString(LOCAL_STORAGE_HOST_KEY, "localhost:5002");
  const [protocol, setProtocol] = useLocalStorageStateString(LOCAL_STORAGE_PROTOCOL_KEY, "ws");
  const [path, setPath] = useLocalStorageStateString(LOCAL_STORAGE_PATH_KEY, "/socket/peer/websocket");
  const [serverMessagesWebsocket, setServerMessagesWebsocket] = useState<string | null>(null);

  const [serverToken, setServerToken] = useLocalStorageStateString("serverToken", "development");

  const setHostInput = useCallback((value: string) => {
    setHost(value);
    localStorage.setItem(LOCAL_STORAGE_HOST_KEY, value);
  }, []);

  const setProtocolInput = useCallback((value: string) => {
    setProtocol(value);
    localStorage.setItem(LOCAL_STORAGE_PROTOCOL_KEY, value);
  }, []);

  const setPathInput = useCallback((value: string) => {
    setPath(value);
    localStorage.setItem(LOCAL_STORAGE_PATH_KEY, value);
  }, []);

  const httpApiUrl = `${protocol === "wss" ? "https" : "http"}://${host}`;

  const client = useMemo(
    () =>
      axios.create({
        headers: {
          Authorization: `Bearer ${serverToken}`,
        },
      }),
    [serverToken]
  );

  const roomApi = useMemo(
    () => (httpApiUrl ? new RoomApi(undefined, httpApiUrl || "", client) : null),
    [client, httpApiUrl]
  );
  const peerApi = useMemo(
    () => (httpApiUrl ? new PeerApi(undefined, httpApiUrl || "", client) : null),
    [client, httpApiUrl]
  );

  return (
    <ServerSdkContext.Provider
      value={{
        roomApi,
        peerApi,
        serverToken,
        setServerToken,

        setSignalingProtocol: setProtocolInput,
        signalingProtocol: protocol,

        setSignalingHost: setHostInput,
        signalingHost: host,

        setSignalingPath: setPathInput,
        signalingPath: path,

        serverMessagesWebsocket,
      }}
    >
      {children}
    </ServerSdkContext.Provider>
  );
};

export const useServerSdk = (): ServerSdkType => {
  const context = useContext(ServerSdkContext);
  if (!context) throw new Error("useServerAddress must be used within a DeveloperInfoProvider");
  return context;
};

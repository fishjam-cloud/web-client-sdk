import {
  createContext,
  JSX,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type { Selector, State } from "./state.types";
import { PeerStatus, TrackId, TrackWithOrigin } from "./state.types";
import { ConnectConfig, CreateConfig } from "@jellyfish-dev/ts-client-sdk";
import {
  DeviceManagerConfig,
  UseCameraAndMicrophoneResult,
  UseCameraResult,
  UseMicrophoneResult,
  UseScreenShareResult,
  UseSetupMediaConfig,
  UseSetupMediaResult,
} from "./types";
import { Client, ClientApi, ClientEvents } from "./Client";
import { MediaDeviceType, ScreenShareManagerConfig } from "./ScreenShareManager";

export type JellyfishContextProviderProps = {
  children: ReactNode;
};

type JellyfishContextType<PeerMetadata, TrackMetadata> = {
  state: State<PeerMetadata, TrackMetadata>;
};

export type UseConnect<PeerMetadata> = (config: ConnectConfig<PeerMetadata>) => () => void;

export type CreateJellyfishClient<PeerMetadata, TrackMetadata> = {
  JellyfishContextProvider: ({ children }: JellyfishContextProviderProps) => JSX.Element;
  useConnect: () => (config: ConnectConfig<PeerMetadata>) => () => void;
  useDisconnect: () => () => void;
  useStatus: () => PeerStatus;
  useSelector: <Result>(selector: Selector<PeerMetadata, TrackMetadata, Result>) => Result;
  useTracks: () => Record<TrackId, TrackWithOrigin<PeerMetadata, TrackMetadata>>;
  useSetupMedia: (config: UseSetupMediaConfig<TrackMetadata>) => UseSetupMediaResult;
  useCamera: () => UseCameraAndMicrophoneResult<TrackMetadata>["camera"];
  useMicrophone: () => UseCameraAndMicrophoneResult<TrackMetadata>["microphone"];
  useScreenShare: () => UseScreenShareResult<TrackMetadata>;
  useClient: () => Client<PeerMetadata, TrackMetadata>;
};

/**
 * Create a client that can be used with a context.
 * Returns context provider, and two hooks to interact with the context.
 *
 * @returns ContextProvider, useSelector, useConnect
 */
export const create = <PeerMetadata, TrackMetadata>(
  config?: CreateConfig<PeerMetadata, TrackMetadata>,
  deviceManagerDefaultConfig?: DeviceManagerConfig,
  screenShareManagerDefaultConfig?: ScreenShareManagerConfig,
): CreateJellyfishClient<PeerMetadata, TrackMetadata> => {
  const JellyfishContext = createContext<JellyfishContextType<PeerMetadata, TrackMetadata> | undefined>(undefined);

  const JellyfishContextProvider: ({ children }: JellyfishContextProviderProps) => JSX.Element = ({
    children,
  }: JellyfishContextProviderProps) => {
    const memoClient = useMemo(() => {
      return new Client<PeerMetadata, TrackMetadata>({
        clientConfig: config,
        deviceManagerDefaultConfig,
        screenShareManagerDefaultConfig,
      });
    }, []);

    const clientRef = useRef(memoClient);
    const mutationRef = useRef(false);

    const subscribe = useCallback((cb: () => void) => {
      const client = clientRef.current;

      const callback = () => {
        mutationRef.current = true;
        cb();
      };

      client.on("socketOpen", callback);
      client.on("socketError", callback);
      client.on("socketClose", callback);
      client.on("authSuccess", callback);
      client.on("authError", callback);
      client.on("disconnected", callback);
      client.on("joined", callback);
      client.on("joinError", callback);
      client.on("peerJoined", callback);
      client.on("peerUpdated", callback);
      client.on("peerLeft", callback);

      client.on("componentAdded", callback);
      client.on("componentUpdated", callback);
      client.on("componentRemoved", callback);

      client.on("trackReady", callback);
      client.on("trackAdded", callback);
      client.on("trackRemoved", callback);
      client.on("trackUpdated", callback);
      client.on("bandwidthEstimationChanged", callback);

      client.on("encodingChanged", callback);
      client.on("voiceActivityChanged", callback);

      client.on("deviceDisabled", callback);
      client.on("deviceEnabled", callback);
      client.on("managerInitialized", callback);
      client.on("managerStarted", callback);
      client.on("deviceStopped", callback);
      client.on("deviceReady", callback);
      client.on("devicesStarted", callback);
      client.on("devicesReady", callback);
      client.on("error", callback);

      client.on("targetTrackEncodingRequested", callback);

      client.on("localTrackAdded", callback);
      client.on("localTrackRemoved", callback);
      client.on("localTrackReplaced", callback);
      client.on("localTrackBandwidthSet", callback);
      client.on("localTrackEncodingBandwidthSet", callback);
      client.on("localTrackEncodingEnabled", callback);
      client.on("localTrackEncodingDisabled", callback);
      client.on("localEndpointMetadataChanged", callback);
      client.on("localTrackMetadataChanged", callback);

      client.on("disconnectRequested", callback);

      return () => {
        client.removeListener("socketOpen", callback);
        client.removeListener("socketError", callback);
        client.removeListener("socketClose", callback);
        client.removeListener("authSuccess", callback);
        client.removeListener("authError", callback);
        client.removeListener("disconnected", callback);
        client.removeListener("joined", callback);
        client.removeListener("joinError", callback);
        client.removeListener("peerJoined", callback);
        client.removeListener("peerUpdated", callback);
        client.removeListener("peerLeft", callback);

        client.removeListener("componentAdded", callback);
        client.removeListener("componentUpdated", callback);
        client.removeListener("componentRemoved", callback);

        client.removeListener("trackReady", callback);
        client.removeListener("trackAdded", callback);
        client.removeListener("trackRemoved", callback);
        client.removeListener("trackUpdated", callback);
        client.removeListener("bandwidthEstimationChanged", callback);

        client.removeListener("encodingChanged", callback);
        client.removeListener("voiceActivityChanged", callback);

        client.removeListener("deviceDisabled", callback);
        client.removeListener("deviceEnabled", callback);
        client.removeListener("managerInitialized", callback);
        client.removeListener("managerStarted", callback);
        client.removeListener("deviceStopped", callback);
        client.removeListener("devicesStarted", callback);
        client.removeListener("devicesReady", callback);
        client.removeListener("error", callback);

        client.removeListener("targetTrackEncodingRequested", callback);

        client.removeListener("localTrackAdded", callback);
        client.removeListener("localTrackRemoved", callback);
        client.removeListener("localTrackReplaced", callback);
        client.removeListener("localTrackBandwidthSet", callback);
        client.removeListener("localTrackEncodingBandwidthSet", callback);
        client.removeListener("localTrackEncodingEnabled", callback);
        client.removeListener("localTrackEncodingDisabled", callback);
        client.removeListener("localEndpointMetadataChanged", callback);
        client.removeListener("localTrackMetadataChanged", callback);

        client.removeListener("disconnectRequested", callback);
      };
    }, []);

    const lastSnapshotRef = useRef<State<PeerMetadata, TrackMetadata> | null>(null);

    const getSnapshot: () => State<PeerMetadata, TrackMetadata> = useCallback(() => {
      if (mutationRef.current || lastSnapshotRef.current === null) {
        const state = {
          remote: clientRef.current.peers,
          screenShareManager: clientRef.current.screenShareManager,
          media: clientRef.current.media,
          bandwidthEstimation: clientRef.current.bandwidthEstimation,
          tracks: clientRef.current.peersTracks,
          local: clientRef.current.local,
          status: clientRef.current.status,
          devices: clientRef.current.devices,
          deviceManager: clientRef.current.deviceManager,
          client: clientRef.current,
        };

        lastSnapshotRef.current = state;
        mutationRef.current = false;
      }

      return lastSnapshotRef.current;
    }, []);

    const state = useSyncExternalStore(subscribe, getSnapshot);

    return <JellyfishContext.Provider value={{ state }}>{children}</JellyfishContext.Provider>;
  };

  const useJellyfishContext = (): JellyfishContextType<PeerMetadata, TrackMetadata> => {
    const context = useContext(JellyfishContext);
    if (!context) throw new Error("useJellyfishContext must be used within a JellyfishContextProvider");
    return context;
  };

  const useSelector = <Result,>(selector: Selector<PeerMetadata, TrackMetadata, Result>): Result => {
    const { state } = useJellyfishContext();

    return useMemo(() => selector(state), [selector, state]);
  };

  const useConnect = (): UseConnect<PeerMetadata> => {
    const { state }: JellyfishContextType<PeerMetadata, TrackMetadata> = useJellyfishContext();

    return useMemo(() => {
      return (config: ConnectConfig<PeerMetadata>): (() => void) => {
        state.client.connect(config);
        return () => {
          state.client.disconnect();
        };
      };
    }, [state.client]);
  };

  const useDisconnect = () => {
    const { state }: JellyfishContextType<PeerMetadata, TrackMetadata> = useJellyfishContext();

    return useCallback(() => {
      state.client.disconnect();
    }, [state.client]);
  };

  const useStatus = () => useSelector((s) => s.status);
  const useTracks = () => useSelector((s) => s.tracks);
  const useClient = () => useSelector((s) => s.client);

  const useCamera = (): UseCameraResult<TrackMetadata> => {
    const { state } = useJellyfishContext();

    return state.devices.camera;
  };

  const useMicrophone = (): UseMicrophoneResult<TrackMetadata> => {
    const { state } = useJellyfishContext();

    return state.devices.microphone;
  };

  const useSetupMedia = (config: UseSetupMediaConfig<TrackMetadata>): UseSetupMediaResult => {
    const { state } = useJellyfishContext();
    const configRef = useRef(config);

    useEffect(() => {
      configRef.current = config;

      if (config.screenShare.streamConfig) {
        state.client.setScreenManagerConfig(config.screenShare.streamConfig);
      }

      state.client.setDeviceManagerConfig({
        storage: config.storage,
      });
    }, [config, state.client]);

    useEffect(() => {
      if (configRef.current.startOnMount && state.deviceManager.getStatus() === "uninitialized") {
        state.devices.init({
          audioTrackConstraints: configRef.current?.microphone?.trackConstraints,
          videoTrackConstraints: configRef.current?.camera?.trackConstraints,
        });
      }
      // eslint-disable-next-line
    }, []);

    useEffect(() => {
      let pending = false;

      const broadcastOnCameraStart = async (
        event: { mediaDeviceType: MediaDeviceType },
        client: ClientApi<PeerMetadata, TrackMetadata>,
      ) => {
        const broadcastOnDeviceChange = configRef.current.camera.broadcastOnDeviceChange ?? "replace";

        if (client.status === "joined" && event.mediaDeviceType === "userMedia" && !pending) {
          if (!client.devices.camera.broadcast?.stream && configRef.current.camera.broadcastOnDeviceStart) {
            pending = true;

            await client.devices.camera
              .addTrack(
                configRef.current.camera.defaultTrackMetadata,
                configRef.current.camera.defaultSimulcastConfig,
                configRef.current.camera.defaultMaxBandwidth,
              )
              .finally(() => {
                pending = false;
              });
          } else if (client.devices.camera.broadcast?.stream && broadcastOnDeviceChange === "replace") {
            pending = true;

            await client.devices.camera.replaceTrack().finally(() => {
              pending = false;
            });
          } else if (client.devices.camera.broadcast?.stream && broadcastOnDeviceChange === "stop") {
            pending = true;

            await client.devices.camera.removeTrack().finally(() => {
              pending = false;
            });
          }
        }
      };

      const managerInitialized: ClientEvents<PeerMetadata, TrackMetadata>["managerInitialized"] = async (
        event,
        client,
      ) => {
        if (event.video?.media?.stream) {
          await broadcastOnCameraStart(event, client);
        }
      };

      const devicesReady: ClientEvents<PeerMetadata, TrackMetadata>["devicesReady"] = async (event, client) => {
        if (event.video.restarted && event.video?.media?.stream) {
          await broadcastOnCameraStart(event, client);
        }
      };

      const deviceReady: ClientEvents<PeerMetadata, TrackMetadata>["deviceReady"] = async (event, client) => {
        if (event.trackType === "video") {
          await broadcastOnCameraStart(event, client);
        }
      };

      state.client.on("managerInitialized", managerInitialized);
      state.client.on("devicesReady", devicesReady);
      state.client.on("deviceReady", deviceReady);

      return () => {
        state.client.removeListener("managerInitialized", managerInitialized);
        state.client.removeListener("devicesReady", devicesReady);
        state.client.removeListener("deviceReady", deviceReady);
      };
    }, [state.client]);

    useEffect(() => {
      const removeOnCameraStopped: ClientEvents<PeerMetadata, TrackMetadata>["deviceStopped"] = async (
        event,
        client,
      ) => {
        if (
          client.status === "joined" &&
          event.mediaDeviceType === "userMedia" &&
          event.trackType === "video" &&
          client.devices.camera.broadcast?.stream
        ) {
          await client.devices.camera.removeTrack();
        }
      };

      state.client.on("deviceStopped", removeOnCameraStopped);

      return () => {
        state.client.removeListener("deviceStopped", removeOnCameraStopped);
      };
    }, [state.client]);

    useEffect(() => {
      const broadcastCameraOnConnect: ClientEvents<PeerMetadata, TrackMetadata>["joined"] = async (_, client) => {
        if (client.devices.camera.stream && configRef.current.camera.broadcastOnConnect) {
          await client.devices.camera.addTrack(
            configRef.current.camera.defaultTrackMetadata,
            configRef.current.camera.defaultSimulcastConfig,
            configRef.current.camera.defaultMaxBandwidth,
          );
        }
      };

      state.client.on("joined", broadcastCameraOnConnect);

      return () => {
        state.client.removeListener("joined", broadcastCameraOnConnect);
      };
    }, [state.client]);

    useEffect(() => {
      let pending = false;

      const broadcastOnMicrophoneStart = async (
        event: { mediaDeviceType: MediaDeviceType },
        client: ClientApi<PeerMetadata, TrackMetadata>,
      ) => {
        const broadcastOnDeviceChange = configRef.current.microphone.broadcastOnDeviceChange ?? "replace";

        if (client.status === "joined" && event.mediaDeviceType === "userMedia" && !pending) {
          if (!client.devices.microphone.broadcast?.stream && configRef.current.microphone.broadcastOnDeviceStart) {
            pending = true;

            await client.devices.microphone
              .addTrack(
                configRef.current.microphone.defaultTrackMetadata,
                configRef.current.microphone.defaultMaxBandwidth,
              )
              .finally(() => {
                pending = false;
              });
          } else if (client.devices.microphone.broadcast?.stream && broadcastOnDeviceChange === "replace") {
            pending = true;

            await client.devices.microphone.replaceTrack().finally(() => {
              pending = false;
            });
          } else if (client.devices.microphone.broadcast?.stream && broadcastOnDeviceChange === "stop") {
            pending = true;

            await client.devices.microphone.removeTrack().finally(() => {
              pending = false;
            });
          }
        }
      };

      const managerInitialized: ClientEvents<PeerMetadata, TrackMetadata>["managerInitialized"] = async (
        event,
        client,
      ) => {
        if (event.audio?.media?.stream) {
          await broadcastOnMicrophoneStart(event, client);
        }
      };

      const devicesReady: ClientEvents<PeerMetadata, TrackMetadata>["devicesReady"] = async (event, client) => {
        if (event.audio.restarted && event.audio?.media?.stream) {
          await broadcastOnMicrophoneStart(event, client);
        }
      };

      const deviceReady: ClientEvents<PeerMetadata, TrackMetadata>["deviceReady"] = async (event, client) => {
        if (event.trackType === "audio") {
          await broadcastOnMicrophoneStart(event, client);
        }
      };

      state.client.on("managerInitialized", managerInitialized);
      state.client.on("deviceReady", deviceReady);
      state.client.on("devicesReady", devicesReady);

      return () => {
        state.client.removeListener("managerInitialized", managerInitialized);
        state.client.removeListener("deviceReady", deviceReady);
        state.client.removeListener("devicesReady", devicesReady);
      };
    }, [state.client]);

    useEffect(() => {
      const removeOnMicrophoneStopped: ClientEvents<PeerMetadata, TrackMetadata>["deviceStopped"] = async (
        event,
        client,
      ) => {
        if (
          client.status === "joined" &&
          event.mediaDeviceType === "userMedia" &&
          event.trackType === "audio" &&
          client.devices.microphone.broadcast?.stream
        ) {
          await client.devices.microphone.removeTrack();
        }
      };

      state.client.on("deviceStopped", removeOnMicrophoneStopped);

      return () => {
        state.client.removeListener("deviceStopped", removeOnMicrophoneStopped);
      };
    }, [state.client]);

    useEffect(() => {
      const broadcastMicrophoneOnConnect: ClientEvents<PeerMetadata, TrackMetadata>["joined"] = async (_, client) => {
        if (client.devices.microphone.stream && configRef.current.microphone.broadcastOnConnect) {
          await client.devices.microphone.addTrack(
            configRef.current.microphone.defaultTrackMetadata,
            configRef.current.microphone.defaultMaxBandwidth,
          );
        }
      };

      state.client.on("joined", broadcastMicrophoneOnConnect);

      return () => {
        state.client.removeListener("joined", broadcastMicrophoneOnConnect);
      };
    }, [state.client]);

    useEffect(() => {
      let adding = false;

      const broadcastOnScreenShareStart: ClientEvents<PeerMetadata, TrackMetadata>["deviceReady"] = async (
        event: { mediaDeviceType: MediaDeviceType },
        client,
      ) => {
        if (
          client.status === "joined" &&
          event.mediaDeviceType === "displayMedia" &&
          !adding &&
          !client.devices.screenShare.broadcast?.stream &&
          configRef.current.screenShare.broadcastOnDeviceStart
        ) {
          adding = true;

          await client.devices.screenShare
            .addTrack(
              configRef.current.screenShare.defaultTrackMetadata,
              configRef.current.screenShare.defaultMaxBandwidth,
            )
            .finally(() => {
              adding = false;
            });
        }
      };

      state.client.on("deviceReady", broadcastOnScreenShareStart);

      return () => {
        state.client.removeListener("deviceReady", broadcastOnScreenShareStart);
      };
    }, [state.client]);

    useEffect(() => {
      const removeOnScreenShareStopped: ClientEvents<PeerMetadata, TrackMetadata>["deviceStopped"] = async (
        event,
        client,
      ) => {
        if (
          client.status === "joined" &&
          event.mediaDeviceType === "displayMedia" &&
          client.devices.screenShare.broadcast?.stream
        ) {
          await client.devices.screenShare.removeTrack();
        }
      };

      state.client.on("deviceStopped", removeOnScreenShareStopped);

      return () => {
        state.client.removeListener("deviceStopped", removeOnScreenShareStopped);
      };
    }, [state.client]);

    useEffect(() => {
      const broadcastScreenShareOnConnect: ClientEvents<PeerMetadata, TrackMetadata>["joined"] = async (_, client) => {
        if (client.devices.screenShare.stream && configRef.current.screenShare.broadcastOnConnect) {
          await client.devices.screenShare.addTrack(
            configRef.current.screenShare.defaultTrackMetadata,
            configRef.current.screenShare.defaultMaxBandwidth,
          );
        }
      };

      state.client.on("joined", broadcastScreenShareOnConnect);

      return () => {
        state.client.removeListener("joined", broadcastScreenShareOnConnect);
      };
    }, [state.client]);

    return useMemo(
      () => ({
        init: () =>
          state.devices.init({
            audioTrackConstraints: configRef.current?.microphone?.trackConstraints,
            videoTrackConstraints: configRef.current?.camera?.trackConstraints,
          }),
      }),
      [state.devices],
    );
  };

  const useScreenShare = (): UseScreenShareResult<TrackMetadata> => {
    const { state } = useJellyfishContext();
    return state.devices.screenShare;
  };

  return {
    JellyfishContextProvider,
    useSelector,
    useConnect,
    useDisconnect,
    useStatus,
    useTracks,
    useSetupMedia,
    useCamera,
    useMicrophone,
    useScreenShare,
    useClient,
  };
};

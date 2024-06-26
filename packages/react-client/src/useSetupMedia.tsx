import type { FishjamContextType, UseSetupMediaConfig, UseSetupMediaResult } from "./types";
import { useEffect, useMemo, useRef } from "react";
import type { MediaDeviceType, TrackType } from "./ScreenShareManager";
import type { ClientApi, ClientEvents } from "./Client";
import type { PeerStatus } from "./state.types";

export const createUseSetupMediaHook = <PeerMetadata, TrackMetadata>(
  useFishjamContext: () => FishjamContextType<PeerMetadata, TrackMetadata>,
) => {
  const isBroadcastedTrackChanged = (
    expectedMediaDeviceType: MediaDeviceType,
    client: ClientApi<PeerMetadata, TrackMetadata>,
    pending: boolean,
    mediaDeviceType: MediaDeviceType,
  ) =>
    client.status === "joined" && mediaDeviceType === expectedMediaDeviceType && !pending && !client.isReconnecting();

  const isBroadcastedTrackStopped = (
    expectedMediaDeviceType: MediaDeviceType,
    expectedTrackType: TrackType,
    status: PeerStatus,
    event: Parameters<ClientEvents<PeerMetadata, TrackMetadata>["deviceStopped"]>[0],
    stream: MediaStream | undefined | null,
  ) =>
    status === "joined" &&
    event.mediaDeviceType === expectedMediaDeviceType &&
    event.trackType === expectedTrackType &&
    stream;

  return (config: UseSetupMediaConfig<TrackMetadata>): UseSetupMediaResult => {
    const { state } = useFishjamContext();
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
        const config = configRef.current.camera;
        const onDeviceChange = config.onDeviceChange ?? "replace";
        const camera = client.devices.camera;
        const stream = camera.broadcast?.stream;

        if (isBroadcastedTrackChanged("userMedia", client, pending, event.mediaDeviceType)) {
          if (!stream && config.broadcastOnDeviceStart) {
            pending = true;

            await camera
              .addTrack(config.defaultTrackMetadata, config.defaultSimulcastConfig, config.defaultMaxBandwidth)
              .finally(() => {
                pending = false;
              });
          } else if (stream && onDeviceChange === "replace") {
            pending = true;

            await camera.replaceTrack().finally(() => {
              pending = false;
            });
          } else if (stream && onDeviceChange === "remove") {
            pending = true;

            await camera.removeTrack().finally(() => {
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
        const camera = client.devices.camera;
        const stream = camera.broadcast?.stream;
        const onDeviceStop = configRef.current.camera.onDeviceStop ?? "mute";

        if (isBroadcastedTrackStopped("userMedia", "video", client.status, event, stream)) {
          if (onDeviceStop === "mute") {
            await camera.muteTrack();
          } else {
            await camera.removeTrack();
          }
        }
      };

      state.client.on("deviceStopped", removeOnCameraStopped);

      return () => {
        state.client.removeListener("deviceStopped", removeOnCameraStopped);
      };
    }, [state.client]);

    useEffect(() => {
      const broadcastCameraOnConnect: ClientEvents<PeerMetadata, TrackMetadata>["joined"] = async (_, client) => {
        const camera = client.devices.camera;
        const stream = camera.stream;
        const config = configRef.current.camera;

        if (stream && config.broadcastOnConnect) {
          await camera.addTrack(config.defaultTrackMetadata, config.defaultSimulcastConfig, config.defaultMaxBandwidth);
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
        const microphone = client.devices.microphone;
        const stream = microphone.broadcast?.stream;
        const config = configRef.current.microphone;
        const onDeviceChange = config.onDeviceChange ?? "replace";

        if (isBroadcastedTrackChanged("userMedia", client, pending, event.mediaDeviceType)) {
          if (!stream && config.broadcastOnDeviceStart) {
            pending = true;

            await microphone.addTrack(config.defaultTrackMetadata, config.defaultMaxBandwidth).finally(() => {
              pending = false;
            });
          } else if (stream && onDeviceChange === "replace") {
            pending = true;

            await microphone.replaceTrack().finally(() => {
              pending = false;
            });
          } else if (stream && onDeviceChange === "remove") {
            pending = true;

            await microphone.removeTrack().finally(() => {
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
      const onMicrophoneStopped: ClientEvents<PeerMetadata, TrackMetadata>["deviceStopped"] = async (event, client) => {
        const microphone = client.devices.microphone;
        const stream = microphone.broadcast?.stream;
        const onDeviceStop = configRef.current.microphone.onDeviceStop ?? "mute";

        if (isBroadcastedTrackStopped("userMedia", "audio", client.status, event, stream)) {
          if (onDeviceStop === "mute") {
            await microphone.muteTrack();
          } else {
            await microphone.removeTrack();
          }
        }
      };

      state.client.on("deviceStopped", onMicrophoneStopped);

      return () => {
        state.client.removeListener("deviceStopped", onMicrophoneStopped);
      };
    }, [state.client]);

    useEffect(() => {
      const broadcastMicrophoneOnConnect: ClientEvents<PeerMetadata, TrackMetadata>["joined"] = async (_, client) => {
        const config = configRef.current.microphone;
        const microphone = client.devices.microphone;

        if (microphone.stream && config.broadcastOnConnect) {
          await microphone.addTrack(config.defaultTrackMetadata, config.defaultMaxBandwidth);
        }
      };

      state.client.on("joined", broadcastMicrophoneOnConnect);

      return () => {
        state.client.removeListener("joined", broadcastMicrophoneOnConnect);
      };
    }, [state.client]);

    useEffect(() => {
      let pending = false;

      const broadcastOnScreenShareStart: ClientEvents<PeerMetadata, TrackMetadata>["deviceReady"] = async (
        event: { mediaDeviceType: MediaDeviceType },
        client,
      ) => {
        const screenShare = client.devices.screenShare;
        const stream = screenShare.broadcast?.stream;
        const { broadcastOnDeviceStart, defaultTrackMetadata, defaultMaxBandwidth } = configRef.current.screenShare;

        if (
          isBroadcastedTrackChanged("displayMedia", client, pending, event.mediaDeviceType) &&
          !stream &&
          broadcastOnDeviceStart
        ) {
          pending = true;

          await screenShare.addTrack(defaultTrackMetadata, defaultMaxBandwidth).finally(() => {
            pending = false;
          });
        }
      };

      state.client.on("deviceReady", broadcastOnScreenShareStart);

      return () => {
        state.client.removeListener("deviceReady", broadcastOnScreenShareStart);
      };
    }, [state.client]);

    useEffect(() => {
      const onScreenShareStop: ClientEvents<PeerMetadata, TrackMetadata>["deviceStopped"] = async (event, client) => {
        const stream = client.devices.screenShare.broadcast?.stream;
        if (isBroadcastedTrackStopped("displayMedia", "video", client.status, event, stream)) {
          await client.devices.screenShare.removeTrack();
        }
      };

      state.client.on("deviceStopped", onScreenShareStop);

      return () => {
        state.client.removeListener("deviceStopped", onScreenShareStop);
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
};

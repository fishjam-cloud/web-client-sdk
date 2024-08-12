import type { FishjamContextType, UseSetupMediaConfig, UseSetupMediaResult } from "./types";
import { useEffect, useMemo, useRef } from "react";
import type { ClientApi, ClientEvents } from "./Client";
import type { PeerStatus } from "./state.types";

export const createUseSetupMediaHook = <PeerMetadata, TrackMetadata>(
  useFishjamContext: () => FishjamContextType<PeerMetadata, TrackMetadata>,
) => {
  const isBroadcastedTrackChanged = (client: ClientApi<PeerMetadata, TrackMetadata>, pending: boolean) =>
    client.status === "joined" && !pending && !client.isReconnecting();

  const isBroadcastedTrackStopped = (status: PeerStatus, stream: MediaStream | undefined | null) =>
    status === "joined" && stream;

  return (config: UseSetupMediaConfig<TrackMetadata>): UseSetupMediaResult => {
    const { state } = useFishjamContext();
    const configRef = useRef(config);

    useEffect(() => {
      configRef.current = config;

      state.client.setDeviceManagerConfig({
        storage: config.storage,
      });
    }, [config, state.client]);

    useEffect(() => {
      if (!configRef.current.startOnMount) return;
      if (
        state.client.audioDeviceManager.getStatus() === "uninitialized" ||
        state.client.videoDeviceManager.getStatus() === "uninitialized"
      ) {
        state.client.initializeDevices({
          audioTrackConstraints: configRef?.current.microphone.trackConstraints,
          videoTrackConstraints: configRef?.current.camera.trackConstraints,
        });
      }
      // eslint-disable-next-line
    }, []);

    useEffect(() => {
      let pending = false;

      const broadcastOnCameraStart = async (client: ClientApi<PeerMetadata, TrackMetadata>) => {
        const config = configRef.current.camera;
        const videoTrackManager = client.videoTrackManager;
        const onDeviceChange = config.onDeviceChange ?? "replace";
        const camera = client.devices.camera;
        const stream = camera.broadcast?.stream;

        if (isBroadcastedTrackChanged(client, pending)) {
          if (!stream && config.broadcastOnDeviceStart) {
            pending = true;

            await videoTrackManager
              .startStreaming(config.defaultTrackMetadata, config.defaultSimulcastConfig, config.defaultMaxBandwidth)
              .finally(() => {
                pending = false;
              });
          } else if (stream && onDeviceChange === "replace") {
            pending = true;

            await videoTrackManager.refreshStreamedTrack().finally(() => {
              pending = false;
            });
          } else if (stream && onDeviceChange === "remove") {
            pending = true;

            await videoTrackManager.stopStreaming().finally(() => {
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
          await broadcastOnCameraStart(client);
        }
      };

      const devicesReady: ClientEvents<PeerMetadata, TrackMetadata>["devicesReady"] = async (event, client) => {
        if (event.trackType === "video" && event.restarted && event?.media?.stream) {
          await broadcastOnCameraStart(client);
        }
      };

      const deviceReady: ClientEvents<PeerMetadata, TrackMetadata>["deviceReady"] = async (event, client) => {
        if (event.trackType === "video") {
          await broadcastOnCameraStart(client);
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
        const videoTrackManager = client.videoTrackManager;
        const stream = camera.broadcast?.stream;
        const onDeviceStop = configRef.current.camera.onDeviceStop ?? "mute";

        if (
          event.mediaDeviceType === "userMedia" &&
          event.trackType === "video" &&
          isBroadcastedTrackStopped(client.status, stream)
        ) {
          if (onDeviceStop === "mute") {
            await videoTrackManager.pauseStreaming();
          } else {
            await videoTrackManager.stopStreaming();
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
          await client.videoTrackManager.startStreaming(
            config.defaultTrackMetadata,
            config.defaultSimulcastConfig,
            config.defaultMaxBandwidth,
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

      const broadcastOnMicrophoneStart = async (client: ClientApi<PeerMetadata, TrackMetadata>) => {
        const microphone = client.devices.microphone;
        const audioTrackManager = client.audioTrackManager;
        const stream = microphone.broadcast?.stream;
        const config = configRef.current.microphone;
        const onDeviceChange = config.onDeviceChange ?? "replace";

        if (isBroadcastedTrackChanged(client, pending)) {
          if (!stream && config.broadcastOnDeviceStart) {
            pending = true;

            await audioTrackManager
              .startStreaming(config.defaultTrackMetadata, undefined, config.defaultMaxBandwidth)
              .finally(() => {
                pending = false;
              });
          } else if (stream && onDeviceChange === "replace") {
            pending = true;

            await audioTrackManager.refreshStreamedTrack().finally(() => {
              pending = false;
            });
          } else if (stream && onDeviceChange === "remove") {
            pending = true;

            await audioTrackManager.stopStreaming().finally(() => {
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
          await broadcastOnMicrophoneStart(client);
        }
      };

      const devicesReady: ClientEvents<PeerMetadata, TrackMetadata>["devicesReady"] = async (event, client) => {
        if (event.trackType === "audio" && event.restarted && event?.media?.stream) {
          await broadcastOnMicrophoneStart(client);
        }
      };

      const deviceReady: ClientEvents<PeerMetadata, TrackMetadata>["deviceReady"] = async (event, client) => {
        if (event.trackType === "audio") {
          await broadcastOnMicrophoneStart(client);
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
        const audioTrackManager = client.audioTrackManager;
        const stream = client.devices.microphone.broadcast?.stream;
        const onDeviceStop = configRef.current.microphone.onDeviceStop ?? "mute";
        const isRightDeviceType = event.mediaDeviceType === "userMedia";
        const isRightTrackType = event.trackType === "audio";

        if (isRightDeviceType && isRightTrackType && isBroadcastedTrackStopped(client.status, stream)) {
          if (onDeviceStop === "mute") {
            await audioTrackManager.pauseStreaming();
          } else {
            await audioTrackManager.stopStreaming();
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
          await client.audioTrackManager.startStreaming(
            config.defaultTrackMetadata,
            undefined,
            config.defaultMaxBandwidth,
          );
        }
      };

      state.client.on("joined", broadcastMicrophoneOnConnect);

      return () => {
        state.client.removeListener("joined", broadcastMicrophoneOnConnect);
      };
    }, [state.client]);

    return useMemo(
      () => ({
        init: () =>
          state.client.initializeDevices({
            audioTrackConstraints: configRef.current?.microphone?.trackConstraints,
            videoTrackConstraints: configRef.current?.camera?.trackConstraints,
          }),
      }),
      [state.client],
    );
  };
};

import { JellyfishClient } from "@jellyfish-dev/ts-client-sdk";
import { useEffect } from "react";
import { getBooleanValue } from "../utils/localStorageUtils";

// TODO: refactor this
export const useLogging = <P, T>(client: JellyfishClient<P, T> | null) => {
  useEffect(() => {
    if (!client) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onJoinSuccess = (peerId: any, peersInRoom: any) => {
      if (getBooleanValue("onJoinSuccess")) {
        console.log({ name: "onJoinSuccess", peerId, peersInRoom });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onJoinError = (metadata: any) => {
      if (getBooleanValue("onJoinError")) {
        console.log({ name: "onJoinError", metadata });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onJoinRemove = (reason: any) => {
      if (getBooleanValue("onRemoved")) {
        console.log({ name: "onRemoved", reason });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPeerJoined = (peer: any) => {
      if (getBooleanValue("onPeerJoined")) {
        console.log({ name: "onPeerJoined", peer });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPeerUpdated = (peer: any) => {
      if (getBooleanValue("onPeerUpdated")) {
        console.log({ name: "onPeerUpdated", peer });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPeerLeft = (peer: any) => {
      if (getBooleanValue("onPeerLeft")) {
        console.log({ name: "onPeerLeft", peer });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onTrackReady = (ctx: any) => {
      if (getBooleanValue("onTrackReady")) {
        console.log({ name: "onTrackReady", ctx });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onTrackAdded = (ctx: any) => {
      if (getBooleanValue("onTrackAdded")) {
        console.log({ name: "onTrackAdded", ctx });
      }

      // todo remove this callback in useEffect return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.on("onEncodingChanged", (context: any) => {
        if (getBooleanValue("onEncodingChanged")) {
          console.log({ name: "onEncodingChanged", context });
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.on("onVoiceActivityChanged", (context: any) => {
        if (getBooleanValue("onVoiceActivityChanged")) {
          console.log({ name: "onVoiceActivityChanged", context });
        }
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onTrackRemoved = (ctx: any) => {
      if (getBooleanValue("onTrackRemoved")) {
        console.log({ name: "onTrackRemoved", ctx });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onTrackUpdated = (ctx: any) => {
      if (getBooleanValue("onTrackUpdated")) {
        console.log({ name: "onTrackUpdated", ctx });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onBandwidthEstimationChanged = (estimation: any) => {
      if (getBooleanValue("onBandwidthEstimationChanged")) {
        console.log({ name: "onBandwidthEstimationChanged", estimation });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onTrackEncodingChanged = (peerId: any, trackId: any, encoding: any) => {
      if (getBooleanValue("onTrackEncodingChanged")) {
        console.log({
          name: "onTrackEncodingChanged",
          peerId,
          trackId,
          encoding,
        });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onTracksPriorityChanged = (enabledTracks: any, disabledTracks: any) => {
      if (getBooleanValue("onTracksPriorityChanged")) {
        console.log({
          name: "onTracksPriorityChanged",
          enabledTracks,
          disabledTracks,
        });
      }
    };

    const onAuthError = () => {
      console.log("onAuthError");
    };

    const onConnectionError = (_message: string) => {
      console.log("onConnectionError");
    };

    const onSocketError = () => {
      console.log("onSocketError");
    };

    client.on("joined", onJoinSuccess);
    client.on("joinError", onJoinError);
    client.on("peerJoined", onPeerJoined);
    client.on("peerUpdated", onPeerUpdated);
    client.on("peerLeft", onPeerLeft);
    client.on("trackReady", onTrackReady);
    client.on("trackAdded", onTrackAdded);
    client.on("trackRemoved", onTrackRemoved);
    client.on("trackUpdated", onTrackUpdated);
    client.on("bandwidthEstimationChanged", onBandwidthEstimationChanged);
    client.on("tracksPriorityChanged", onTracksPriorityChanged);

    client.on("authError", onAuthError);
    client.on("connectionError", onConnectionError);
    client.on("socketError", onSocketError);

    return () => {
      client.off("joined", onJoinSuccess);
      client.off("joinError", onJoinError);
      client.off("peerJoined", onPeerJoined);
      client.off("peerUpdated", onPeerUpdated);
      client.off("peerLeft", onPeerLeft);
      client.off("trackReady", onTrackReady);
      client.off("trackAdded", onTrackAdded);
      client.off("trackRemoved", onTrackRemoved);
      client.off("trackUpdated", onTrackUpdated);
      client.off("bandwidthEstimationChanged", onBandwidthEstimationChanged);
      client.off("tracksPriorityChanged", onTracksPriorityChanged);

      client.off("authError", onAuthError);
      client.off("connectionError", onConnectionError);
      client.off("socketError", onSocketError);
    };
  }, [client]);
};

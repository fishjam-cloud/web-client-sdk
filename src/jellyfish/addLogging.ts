import { JellyfishClient } from "./JellyfishClient";

export const getBooleanValue = (name: string, defaultValue: boolean = true): boolean => {
  const stringValue = localStorage.getItem(name);
  if (stringValue === null || stringValue === undefined) {
    return defaultValue;
  }
  return stringValue === "true";
};

export const addLogging = <PeerMetadata, TrackMetadata>(client: JellyfishClient<PeerMetadata, TrackMetadata>) => {
  client.on("onJoinSuccess", (peerId, peersInRoom) => {
    if (getBooleanValue("onJoinSuccess")) {
      console.log({ name: "onJoinSuccess", peerId, peersInRoom });
    }
  });
  client.on("onJoinError", (metadata) => {
    if (getBooleanValue("onJoinError")) {
      console.log({ name: "onJoinError", metadata });
    }
  });
  client.on("onRemoved", (reason) => {
    if (getBooleanValue("onRemoved")) {
      console.log({ name: "onRemoved", reason });
    }
  });
  client.on("onPeerJoined", (peer) => {
    if (getBooleanValue("onPeerJoined")) {
      console.log({ name: "onPeerJoined", peer });
    }
  });
  client.on("onPeerUpdated", (peer) => {
    if (getBooleanValue("onPeerUpdated")) {
      console.log({ name: "onPeerUpdated", peer });
    }
  });
  client.on("onPeerLeft", (peer) => {
    if (getBooleanValue("onPeerLeft")) {
      console.log({ name: "onPeerLeft", peer });
    }
  });
  client.on("onTrackReady", (ctx) => {
    if (getBooleanValue("onTrackReady")) {
      console.log({ name: "onTrackReady", ctx });
    }
  });
  client.on("onTrackAdded", (ctx) => {
    if (getBooleanValue("onTrackAdded")) {
      console.log({ name: "onTrackAdded", ctx });
    }
    ctx.on("onEncodingChanged", (context) => {
      if (getBooleanValue("onEncodingChanged")) {
        console.log({ name: "onEncodingChanged", context });
      }
    });
    ctx.on("onVoiceActivityChanged", (context) => {
      if (getBooleanValue("onVoiceActivityChanged")) {
        console.log({ name: "onVoiceActivityChanged", context });
      }
    });
  });
  client.on("onTrackRemoved", (ctx) => {
    if (getBooleanValue("onTrackRemoved")) {
      console.log({ name: "onTrackRemoved", ctx });
    }
  });
  client.on("onTrackUpdated", (ctx) => {
    if (getBooleanValue("onTrackUpdated")) {
      console.log({ name: "onTrackUpdated", ctx });
    }
  });
  client.on("onBandwidthEstimationChanged", (estimation) => {
    if (getBooleanValue("onBandwidthEstimationChanged")) {
      console.log({ name: "onBandwidthEstimationChanged", estimation });
    }
  });
  client.on("onTrackEncodingChanged", (peerId, trackId, encoding) => {
    if (getBooleanValue("onTrackEncodingChanged")) {
      console.log({
        name: "onTrackEncodingChanged",
        peerId,
        trackId,
        encoding,
      });
    }
  });
  client.on("onTracksPriorityChanged", (enabledTracks, disabledTracks) => {
    if (getBooleanValue("onTracksPriorityChanged")) {
      console.log({
        name: "onTracksPriorityChanged",
        enabledTracks,
        disabledTracks,
      });
    }
  });
};

import { JellyfishClient } from "./JellyfishClient";

/**
 * Save a string value to local storage
 *
 * @param key - key to save the value
 * @param value - value to save
 */
export const saveString = (key: string, value: string) => {
  localStorage.setItem(key, value);
};

/**
 * Load a string value from local storage
 *
 * @param key - key to load the value
 * @param defaultValue - default value to return if the key is not found
 * @returns loaded value or default value
 */
export const loadString = (key: string, defaultValue = "") => {
  const value = localStorage.getItem(key);
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return value;
};

/**
 * Save an object to local storage.
 * Make sure the object is serializable.
 *
 * @param key - key to save the value
 * @param value - object to save
 */
export const saveObject = <T>(key: string, value: T) => {
  const stringValue = JSON.stringify(value);
  saveString(key, stringValue);
};

/**
 * Load an object from local storage.
 *
 * @param key - key to load the value
 * @param defaultValue - default value to return if the key is not found
 * @returns loaded object or default value
 */
export const loadObject = <T>(key: string, defaultValue: T): T => {
  const stringValue = loadString(key, "");
  if (stringValue === "") {
    return defaultValue;
  }
  return JSON.parse(stringValue) as T;
};

/**
 * Remove a saved item from local storage
 * @param key - key to remove
 */
export const removeSavedItem = (key: string) => {
  localStorage.removeItem(key);
};

/**
 * Get a boolean value from local storage
 *
 * @param name - key to load the value
 * @param defaultValue - default value to return if the key is not found
 * @returns loaded value or default value
 */
export const getBooleanValue = (name: string, defaultValue = true): boolean => {
  const stringValue = localStorage.getItem(name);
  if (stringValue === null || stringValue === undefined) {
    return defaultValue;
  }
  return stringValue === "true";
};

/**
 * Add logging to a client on events
 *
 * @param client - client to add logging to
 */
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

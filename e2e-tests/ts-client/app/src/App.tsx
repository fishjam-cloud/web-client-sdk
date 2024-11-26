import type {
  Endpoint,
  SerializedMediaEvent,
  TrackContext,
  Encoding,
  WebRTCEndpointEvents,
  TrackContextEvents,
  BandwidthLimit,
  SimulcastConfig,
} from "@fishjam-cloud/ts-client";
import { WebRTCEndpoint, sdkVersion } from "@fishjam-cloud/ts-client";
import { PeerMessage } from "@fishjam-cloud/protobufs/fishjamPeer";
import { useEffect, useState, useSyncExternalStore } from "react";
import { MockComponent } from "./MockComponent";
import { VideoPlayerWithDetector } from "./VideoPlayerWithDetector";

/* eslint-disable no-console */

export type EndpointMetadata = {
  goodStuff: string;
};

export type TrackMetadata = {
  goodTrack: string;
};

class RemoteStore {
  cache: Record<
    string,
    [Record<string, Endpoint>, Record<string, TrackContext>]
  > = {};
  invalidateCache: boolean = false;

  constructor(private webrtc: WebRTCEndpoint) {}

  subscribe(callback: () => void) {
    const cb = () => {
      this.invalidateCache = true;
      callback();
    };

    const trackCb: TrackContextEvents["encodingChanged"] = () => cb();

    const trackAddedCb: WebRTCEndpointEvents["trackAdded"] = (context) => {
      context.on("encodingChanged", () => trackCb);
      context.on("voiceActivityChanged", () => trackCb);

      callback();
    };

    const removeCb: WebRTCEndpointEvents["trackRemoved"] = (context) => {
      context.removeListener("encodingChanged", () => trackCb);
      context.removeListener("voiceActivityChanged", () => trackCb);

      callback();
    };

    this.webrtc.on("trackAdded", trackAddedCb);
    this.webrtc.on("trackReady", cb);
    this.webrtc.on("trackUpdated", cb);
    this.webrtc.on("trackRemoved", removeCb);
    this.webrtc.on("endpointAdded", cb);
    this.webrtc.on("endpointRemoved", cb);
    this.webrtc.on("endpointUpdated", cb);

    return () => {
      this.webrtc.removeListener("trackAdded", trackAddedCb);
      this.webrtc.removeListener("trackReady", cb);
      this.webrtc.removeListener("trackUpdated", cb);
      this.webrtc.removeListener("trackRemoved", removeCb);
      this.webrtc.removeListener("endpointAdded", cb);
      this.webrtc.removeListener("endpointRemoved", cb);
      this.webrtc.removeListener("endpointUpdated", cb);
    };
  }

  snapshot() {
    const newTracks = webrtc.getRemoteTracks();
    const newEndpoints = webrtc.getRemoteEndpoints();
    const ids =
      Object.keys(newTracks).sort().join(":") +
      Object.keys(newEndpoints).sort().join(":");
    if (!(ids in this.cache) || this.invalidateCache) {
      this.cache[ids] = [newEndpoints, newTracks];
      this.invalidateCache = false;
    }
    return this.cache[ids];
  }
}

// Assign a random client ID to make it easier to distinguish their messages
const clientId = Math.floor(Math.random() * 100);

const webrtc = new WebRTCEndpoint();
(window as typeof window & { webrtc: WebRTCEndpoint }).webrtc = webrtc;
const remoteTracksStore = new RemoteStore(webrtc);

function connect(token: string, metadata: EndpointMetadata) {
  const websocketUrl = "ws://localhost:5002/socket/peer/websocket";
  const websocket = new WebSocket(websocketUrl);
  websocket.binaryType = "arraybuffer";

  function socketOpenHandler(_event: Event) {
    const message = PeerMessage.encode({
      authRequest: { token, sdkVersion },
    }).finish();
    websocket.send(message);
  }

  websocket.addEventListener("open", socketOpenHandler);

  webrtc.on("sendMediaEvent", (mediaEvent: SerializedMediaEvent) => {
    console.log(`%c(${clientId}) - Send: ${mediaEvent}`, "color:blue");
    const message = PeerMessage.encode({
      mediaEvent: { data: mediaEvent },
    }).finish();
    websocket.send(message);
  });

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const messageHandler = (event: MessageEvent<any>) => {
    const uint8Array = new Uint8Array(event.data);
    try {
      const data = PeerMessage.decode(uint8Array);
      if (data?.mediaEvent) {
        // @ts-ignore
        const mediaEvent = JSON.parse(data?.mediaEvent?.data);
        console.log(
          `%c(${clientId}) - Received: ${JSON.stringify(mediaEvent)}`,
          "color:green",
        );
      } else {
        console.log(
          `%c(${clientId}) - Received: ${JSON.stringify(data)}`,
          "color:green",
        );
      }

      if (data.authenticated !== undefined) {
        webrtc.connect(metadata);
      } else if (data.authRequest !== undefined) {
        console.warn("Received unexpected control message: authRequest");
      } else if (data.mediaEvent !== undefined) {
        webrtc.receiveMediaEvent(data.mediaEvent.data);
      }
    } catch (e) {
      console.warn(`Received invalid control message, error: ${e}`);
    }
  };

  websocket.addEventListener("message", messageHandler);

  const closeHandler = (event: unknown) => {
    console.log({ name: "Close handler!", event });
  };

  websocket.addEventListener("close", closeHandler);

  const errorHandler = (event: unknown) => {
    console.log({ name: "Error handler!", event });
  };

  websocket.addEventListener("error", errorHandler);

  const trackReady = (event: unknown) => {
    console.log({ name: "trackReady", event });
  };

  websocket.addEventListener("trackReady", trackReady);
}

async function addScreenshareTrack(): Promise<string> {
  const stream = await window.navigator.mediaDevices.getDisplayMedia();
  const track = stream.getVideoTracks()[0];

  const trackMetadata: TrackMetadata = { goodTrack: "screenshare" };
  const simulcastConfig: SimulcastConfig = {
    enabled: false,
    activeEncodings: [],
    disabledEncodings: [],
  };
  const maxBandwidth: BandwidthLimit = 0;

  return webrtc.addTrack(track, trackMetadata, simulcastConfig, maxBandwidth);
}

export function App() {
  const [tokenInput, setTokenInput] = useState(
    localStorage.getItem("token") ?? "",
  );
  const [endpointMetadataInput, setEndpointMetadataInput] = useState(
    JSON.stringify({ goodStuff: "ye" }),
  );
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    localStorage.setItem("token", tokenInput);
  }, [tokenInput]);

  const handleConnect = () =>
    connect(
      tokenInput,
      endpointMetadataInput !== ""
        ? JSON.parse(endpointMetadataInput)
        : undefined,
    );
  const handleStartScreenshare = () => addScreenshareTrack();
  const handleUpdateEndpointMetadata = () =>
    webrtc.updateEndpointMetadata(JSON.parse(endpointMetadataInput));

  const [remoteEndpoints, remoteTracks] = useSyncExternalStore(
    (callback) => remoteTracksStore.subscribe(callback),
    () => remoteTracksStore.snapshot(),
  );

  const setEncoding = (trackId: string, encoding: Encoding) => {
    webrtc.setTargetTrackEncoding(trackId, encoding);
  };

  useEffect(() => {
    const callback = () => setConnected(true);

    webrtc.on("connected", callback);

    return () => {
      webrtc.removeListener("connected", callback);
    };
  }, []);

  return (
    <div style={{ display: "flex" }}>
      <div>
        <div>
          <input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="token"
          />
          <input
            value={endpointMetadataInput}
            onChange={(e) => setEndpointMetadataInput(e.target.value)}
            placeholder="endpoint metadata"
          />
          <button onClick={handleConnect}>Connect</button>
          <button onClick={handleStartScreenshare}>Start screenshare</button>
          <button onClick={handleUpdateEndpointMetadata}>
            Update metadata
          </button>
        </div>
        <div id="connection-status">{connected ? "true" : "false"}</div>
        <hr />
        <MockComponent webrtc={webrtc} />
        <div style={{ width: "100%" }}>
          {Object.values(remoteTracks).map(
            ({ stream, trackId, endpoint, metadata }) => (
              <div
                key={trackId}
                data-endpoint-id={endpoint.id}
                data-stream-id={stream?.id}
              >
                <div>Endpoint id: {endpoint.id}</div>
                Metadata:{" "}
                <code className="metadata">{JSON.stringify(metadata)}</code>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <VideoPlayerWithDetector
                    id={endpoint.id}
                    stream={stream ?? undefined}
                    webrtc={webrtc}
                  />
                </div>
                <div data-name="stream-id">{stream?.id}</div>
                <div>
                  <button onClick={() => setEncoding(trackId, "l")}>l</button>
                  <button onClick={() => setEncoding(trackId, "m")}>m</button>
                  <button onClick={() => setEncoding(trackId, "h")}>h</button>
                </div>
              </div>
            ),
          )}
        </div>
      </div>
      <div style={{ borderLeft: "1px solid gray" }}>
        Our metadata:
        <input
          value={endpointMetadataInput}
          onChange={(e) => setEndpointMetadataInput(e.target.value)}
        ></input>
        <hr />
        <div id="endpoints-container">
          Endpoints:
          {Object.values(remoteEndpoints).map(({ id, metadata }) => (
            <details key={id} open>
              <summary>{id}</summary>
              metadata:{" "}
              <code id={`metadata-${id}`}>{JSON.stringify(metadata)}</code>
              <br />
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

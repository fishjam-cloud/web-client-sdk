import { Endpoint } from "./webrtc";
import { JellyfishClient } from "./JellyfishClient";
import { isAuthError } from "./auth";

export type ReconnectConfig = {
  /*
   + default: 3
   */
  maxAttempts?: number;
  /*
   * unit: milliseconds
   * default: 500
   */
  initialDelay?: number;
  /*
   * unit: milliseconds
   * default: 500
   */
  delay?: number;

  /*
   * default: false
   */
  addTracksOnReconnect?: boolean;
};

const DISABLED_RECONNECT_CONFIG: Required<ReconnectConfig> = {
  maxAttempts: 0,
  initialDelay: 0,
  delay: 0,
  addTracksOnReconnect: false,
};

const DEFAULT_RECONNECT_CONFIG: Required<ReconnectConfig> = {
  maxAttempts: 3,
  initialDelay: 500,
  delay: 500,
  addTracksOnReconnect: true,
};

export class ReconnectManager<PeerMetadata, TrackMetadata> {
  private readonly reconnectConfig: Required<ReconnectConfig>;

  private readonly connect: (metadata: PeerMetadata) => void;
  private readonly client: JellyfishClient<PeerMetadata, TrackMetadata>;
  private initialMetadata: PeerMetadata | undefined | null = undefined;

  private reconnectAttempt: number = 0;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private reconnectFailedNotificationSend: boolean = false;
  private ongoingReconnection: boolean = false;
  private lastLocalEndpoint: Endpoint<PeerMetadata, TrackMetadata> | null = null;

  constructor(
    client: JellyfishClient<PeerMetadata, TrackMetadata>,
    connect: (metadata: PeerMetadata) => void,
    config?: ReconnectConfig | boolean,
  ) {
    this.client = client;
    this.connect = connect;
    this.reconnectConfig = createReconnectConfig(config);

    this.client.on("socketError", () => {
      this.reconnect();
    });

    this.client.on("socketClose", (event) => {
      if (isAuthError(event.reason)) return;

      this.reconnect();
    });

    this.client.on("authSuccess", () => {
      this.reset(this.initialMetadata!);
    });

    this.client.on("joined", () => {
      this.handleReconnect();
    });
  }

  public reset(initialMetadata: PeerMetadata) {
    this.initialMetadata = initialMetadata;
    this.reconnectAttempt = 0;
    if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);
    this.reconnectTimeoutId = null;
  }

  private getLastPeerMetadata(): PeerMetadata | undefined {
    return this.lastLocalEndpoint?.metadata;
  }

  private reconnect() {
    if (this.reconnectTimeoutId) return;

    if (this.reconnectAttempt >= this.reconnectConfig.maxAttempts) {
      if (!this.reconnectFailedNotificationSend) {
        this.reconnectFailedNotificationSend = true;
      }
      return;
    }

    if (!this.ongoingReconnection) {
      this.ongoingReconnection = true;
      this.lastLocalEndpoint = this.client.getLocalEndpoint() || null;
    }

    const timeout = this.reconnectConfig.initialDelay + this.reconnectAttempt * this.reconnectConfig.delay;

    this.reconnectAttempt += 1;

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;

      this.connect(this.getLastPeerMetadata() ?? this.initialMetadata!);
    }, timeout);
  }

  private handleReconnect() {
    if (!this.ongoingReconnection) return;

    if (this.lastLocalEndpoint && this.reconnectConfig.addTracksOnReconnect) {
      this.lastLocalEndpoint.tracks.forEach(async (track) => {
        if (!track.track || !track.stream) return;

        await this.client.addTrack(
          track.track,
          track.stream,
          track.rawMetadata,
          track.simulcastConfig,
          track.maxBandwidth,
        );
      });
    }

    this.lastLocalEndpoint = null;
    this.ongoingReconnection = false;
  }
}

export const createReconnectConfig = (config?: ReconnectConfig | boolean): Required<ReconnectConfig> => {
  if (!config) return DISABLED_RECONNECT_CONFIG;
  if (config === true) return DEFAULT_RECONNECT_CONFIG;

  return {
    maxAttempts: config?.maxAttempts ?? DEFAULT_RECONNECT_CONFIG.maxAttempts,
    initialDelay: config?.initialDelay ?? DEFAULT_RECONNECT_CONFIG.initialDelay,
    delay: config?.delay ?? DEFAULT_RECONNECT_CONFIG.delay,
    addTracksOnReconnect: config?.addTracksOnReconnect ?? DEFAULT_RECONNECT_CONFIG.addTracksOnReconnect,
  };
};

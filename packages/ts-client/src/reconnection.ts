import { Endpoint } from './webrtc';
import { FishjamClient, MessageEvents } from './FishjamClient';
import { isAuthError } from './auth';

export type ReconnectionStatus = 'reconnecting' | 'idle' | 'error';

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
  private readonly client: FishjamClient<PeerMetadata, TrackMetadata>;
  private initialMetadata: PeerMetadata | undefined | null = undefined;

  private reconnectAttempt: number = 0;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private status: ReconnectionStatus = 'idle';
  private lastLocalEndpoint: Endpoint<PeerMetadata, TrackMetadata> | null =
    null;
  private removeEventListeners: () => void = () => {};

  constructor(
    client: FishjamClient<PeerMetadata, TrackMetadata>,
    connect: (metadata: PeerMetadata) => void,
    config?: ReconnectConfig | boolean,
  ) {
    this.client = client;
    this.connect = connect;
    this.reconnectConfig = createReconnectConfig(config);

    const onSocketError: MessageEvents<
      PeerMetadata,
      TrackMetadata
    >['socketError'] = () => {
      this.reconnect();
    };
    this.client.on('socketError', onSocketError);

    const onConnectionError: MessageEvents<
      PeerMetadata,
      TrackMetadata
    >['connectionError'] = () => {
      this.reconnect();
    };
    this.client.on('connectionError', onConnectionError);

    const onSocketClose: MessageEvents<
      PeerMetadata,
      TrackMetadata
    >['socketClose'] = (event) => {
      if (isAuthError(event.reason)) return;

      this.reconnect();
    };
    this.client.on('socketClose', onSocketClose);

    const onAuthSuccess: MessageEvents<
      PeerMetadata,
      TrackMetadata
    >['authSuccess'] = () => {
      this.reset(this.initialMetadata!);
    };
    this.client.on('authSuccess', onAuthSuccess);

    this.removeEventListeners = () => {
      this.client.off('socketError', onSocketError);
      this.client.off('connectionError', onConnectionError);
      this.client.off('socketClose', onSocketClose);
      this.client.off('authSuccess', onAuthSuccess);
    };
  }

  public isReconnecting(): boolean {
    return this.status === 'reconnecting';
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
      if (this.status === 'reconnecting') {
        this.status = 'error';

        this.client.emit('reconnectionRetriesLimitReached');
      }
      return;
    }

    if (this.status !== 'reconnecting') {
      this.status = 'reconnecting';

      this.client.emit('reconnectionStarted');

      this.lastLocalEndpoint = this.client.getLocalEndpoint() || null;
    }

    const timeout =
      this.reconnectConfig.initialDelay +
      this.reconnectAttempt * this.reconnectConfig.delay;

    this.reconnectAttempt += 1;

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;

      this.connect(this.getLastPeerMetadata() ?? this.initialMetadata!);
    }, timeout);
  }

  public async handleReconnect() {
    if (this.status !== 'reconnecting') return;

    if (this.lastLocalEndpoint && this.reconnectConfig.addTracksOnReconnect) {
      for await (const element of this.lastLocalEndpoint.tracks) {
        const [_, track] = element;
        if (!track.track || track.track.readyState !== 'live') return;

        await this.client.addTrack(
          track.track,
          track.rawMetadata,
          track.simulcastConfig,
          track.maxBandwidth,
        );
      }
    }

    this.lastLocalEndpoint = null;
    this.status = 'idle';

    this.client.emit('reconnected');
  }

  public cleanup() {
    this.removeEventListeners();
    this.removeEventListeners = () => {};
  }
}

export const createReconnectConfig = (
  config?: ReconnectConfig | boolean,
): Required<ReconnectConfig> => {
  if (!config) return DISABLED_RECONNECT_CONFIG;
  if (config === true) return DEFAULT_RECONNECT_CONFIG;

  return {
    maxAttempts: config?.maxAttempts ?? DEFAULT_RECONNECT_CONFIG.maxAttempts,
    initialDelay: config?.initialDelay ?? DEFAULT_RECONNECT_CONFIG.initialDelay,
    delay: config?.delay ?? DEFAULT_RECONNECT_CONFIG.delay,
    addTracksOnReconnect:
      config?.addTracksOnReconnect ??
      DEFAULT_RECONNECT_CONFIG.addTracksOnReconnect,
  };
};

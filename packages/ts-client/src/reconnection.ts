import type { Endpoint } from '@fishjam-cloud/webrtc-client';

import { isAuthError } from './auth';
import type { FishjamClient } from './FishjamClient';
import { isJoinError } from './guards';
import type { MessageEvents, Metadata, TrackMetadata } from './types';

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
  addTracksOnReconnect: false,
};

export class ReconnectManager<PeerMetadata, ServerMetadata> {
  private readonly reconnectConfig: Required<ReconnectConfig>;

  private readonly connect: (metadata: PeerMetadata) => void;
  private readonly client: FishjamClient<PeerMetadata, ServerMetadata>;
  private initialPeerMetadata: PeerMetadata | undefined | null = undefined;

  private reconnectAttempt: number = 0;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private status: ReconnectionStatus = 'idle';
  private lastLocalEndpoint: Endpoint | null = null;
  private removeEventListeners: () => void = () => {};

  constructor(
    client: FishjamClient<PeerMetadata, ServerMetadata>,
    connect: (metadata: PeerMetadata) => Promise<void>,
    config?: ReconnectConfig | boolean,
  ) {
    this.client = client;
    this.connect = connect;
    this.reconnectConfig = createReconnectConfig(config);

    const onSocketError: MessageEvents<PeerMetadata, ServerMetadata>['socketError'] = () => {
      console.log(`[ReconnectManager] socketError received, status=${this.status}, triggering reconnect`);
      this.reconnect();
    };
    this.client.on('socketError', onSocketError);

    const onConnectionError: MessageEvents<PeerMetadata, ServerMetadata>['connectionError'] = () => {
      console.log(`[ReconnectManager] connectionError received, status=${this.status}, triggering reconnect`);
      this.reconnect();
    };
    this.client.on('connectionError', onConnectionError);

    const onSocketClose: MessageEvents<PeerMetadata, ServerMetadata>['socketClose'] = (event) => {
      const authErr = isAuthError(event.reason);
      const joinErr = isJoinError(event.reason);
      console.log(`[ReconnectManager] socketClose received, reason="${event.reason}", code=${event.code}, isAuthError=${authErr}, isJoinError=${joinErr}, status=${this.status}`);
      if (authErr) {
        console.log(`[ReconnectManager] socketClose: auth error detected, RETURNING EARLY, status remains=${this.status}`);
        return;
      }
      if (joinErr) {
        console.log(`[ReconnectManager] socketClose: join error detected, RETURNING EARLY, status remains=${this.status}`);
        return;
      }
      console.log(`[ReconnectManager] socketClose: no auth/join error, calling reconnect()`);
      this.reconnect();
    };
    this.client.on('socketClose', onSocketClose);

    const onAuthSuccess: MessageEvents<PeerMetadata, ServerMetadata>['authSuccess'] = () => {
      console.log(`[ReconnectManager] authSuccess received, resetting`);
      this.reset(this.initialPeerMetadata!);
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

  public reset(initialPeerMetadata: PeerMetadata) {
    console.log(`[ReconnectManager] reset: clearing attempt counter (was ${this.reconnectAttempt}), status=${this.status}`);
    this.initialPeerMetadata = initialPeerMetadata;
    this.reconnectAttempt = 0;
    if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);
    this.reconnectTimeoutId = null;
  }

  private getLastPeerMetadata(): PeerMetadata | undefined {
    const endpointMetadata = this.lastLocalEndpoint?.metadata as Metadata<PeerMetadata, ServerMetadata> | undefined;
    return endpointMetadata?.peer;
  }

  private reconnect() {
    if (this.reconnectTimeoutId) {
      console.log(`[ReconnectManager] reconnect: timeout already pending, skipping`);
      return;
    }

    if (this.reconnectAttempt >= this.reconnectConfig.maxAttempts) {
      console.log(`[ReconnectManager] reconnect: attempt ${this.reconnectAttempt} >= maxAttempts ${this.reconnectConfig.maxAttempts}, status=${this.status}`);
      if (this.status === 'reconnecting') {
        this.status = 'error';
        console.log(`[ReconnectManager] reconnect: status → error, emitting reconnectionRetriesLimitReached`);
        this.client.emit('reconnectionRetriesLimitReached');
      }
      return;
    }

    if (this.status !== 'reconnecting') {
      this.status = 'reconnecting';
      console.log(`[ReconnectManager] reconnect: status → reconnecting, emitting reconnectionStarted`);
      this.client.emit('reconnectionStarted');

      this.lastLocalEndpoint = this.client.getLocalPeer() || null;
    }

    const timeout = this.reconnectConfig.initialDelay + this.reconnectAttempt * this.reconnectConfig.delay;

    this.reconnectAttempt += 1;
    console.log(`[ReconnectManager] reconnect: scheduling attempt ${this.reconnectAttempt}/${this.reconnectConfig.maxAttempts} in ${timeout}ms`);

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;

      const peerMetadata = this.getLastPeerMetadata() ?? this.initialPeerMetadata!;
      console.log(`[ReconnectManager] reconnect: executing connect() for attempt ${this.reconnectAttempt}`);
      this.connect(peerMetadata);
    }, timeout);
  }

  public async handleReconnect() {
    console.log(`[ReconnectManager] handleReconnect: status=${this.status}`);
    if (this.status !== 'reconnecting') return;
    if (this.lastLocalEndpoint && this.reconnectConfig.addTracksOnReconnect) {
      for await (const element of this.lastLocalEndpoint.tracks) {
        const [_, track] = element;
        if (!track.track || track.track.readyState !== 'live') return;

        await this.client.addTrack(
          track.track,
          track.metadata as TrackMetadata,
          track.simulcastConfig,
          track.maxBandwidth,
        );
      }
    }

    this.lastLocalEndpoint = null;
    this.status = 'idle';
    console.log(`[ReconnectManager] handleReconnect: status → idle, emitting reconnected`);

    this.client.emit('reconnected');
  }

  public cleanup() {
    this.removeEventListeners();
    this.removeEventListeners = () => {};
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

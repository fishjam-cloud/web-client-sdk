import { EventEmitter } from 'events';

import type TypedEmitter from 'typed-emitter';

import type {
  DataChannelManagerEvents,
  DataChannelMessagePayload,
  DataChannelOptions,
  DataChannelType,
  Logger,
} from '../types';
import { DataChannel } from './DataChannel';

/**
 * Manages data channels for WebRTC connection.
 * Handles automatic creation and lifecycle of up to 2 bidirectional channels (reliable and lossy).
 *
 * Events:
 * - `ready` - Emitted when both reliable and lossy data channel publishers are ready to send data.
 * - `channelOpen` - Emitted when a data channel is opened. Payload includes the channel type.
 * - `error` - Emitted when a data channel errors. Payload includes the channel type and error.
 * - `data` - Emitted when data is received on any data channel. Payload includes channel type and binary data.
 *
 * @internal
 */
export class DataChannelManager extends (EventEmitter as new () => TypedEmitter<Required<DataChannelManagerEvents>>) {
  private reliableChannel: DataChannel | null = null;
  private lossyChannel: DataChannel | null = null;

  constructor(
    private readonly createDataChannel: (label: string, init: RTCDataChannelInit) => RTCDataChannel,
    private readonly triggerRenegotiation: () => void,
    private readonly logger: Logger,
  ) {
    super();
  }

  /**
   * Initialize channels and trigger renegotiation.
   * Returns when both channels are open or throws if any channel errors.
   */
  public async connect(): Promise<void> {
    if (this.getChannelsReadiness()) return;

    this.createChannels();

    this.triggerRenegotiation();

    await this.waitForChannelsReady();
  }

  /**
   * Wait for both channels to be ready or throw on error.
   * @private
   */
  private waitForChannelsReady(): Promise<void> {
    if (this.getChannelsReadiness()) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };

      const onError = (type: DataChannelType, error: Event) => {
        cleanup();
        reject(new Error(`Data channel ${type} error: ${error}`));
      };

      const cleanup = () => {
        this.removeListener('ready', onReady);
        this.removeListener('error', onError);
      };

      this.on('ready', onReady);
      this.on('error', onError);
    });
  }

  /**
   * Publish data through a data channel.
   * Throws an error if the channel doesn't exist or isn't ready.
   * @param data - The data to send as Uint8Array
   * @param options - Options specifying which channel to use
   * @throws Error if the channel doesn't exist or isn't open
   */
  public publishData(data: Uint8Array, options: DataChannelOptions): void {
    const type: DataChannelType = options.reliable ? 'reliable' : 'lossy';
    const channel = type === 'reliable' ? this.reliableChannel : this.lossyChannel;

    if (!channel) {
      throw new Error(
        `Cannot publish data: ${type} channel not created. Call connectDataPublishers() first or enable negotiateOnConnect.`,
      );
    }

    if (channel.status !== 'open') {
      throw new Error(
        `Cannot publish data: ${type} channel not ready (status: ${channel.status}). Wait for dataPublisherReady event.`,
      );
    }

    channel.send(data);
  }

  /**
   * Close all data channels and remove all event listeners.
   * Called during cleanup/disconnect.
   */
  public cleanup(): void {
    this.logger.warn('Cleaning up data channels');

    if (this.reliableChannel) {
      this.reliableChannel.close();
      this.reliableChannel = null;
    }

    if (this.lossyChannel) {
      this.lossyChannel.close();
      this.lossyChannel = null;
    }

    this.removeAllListeners();
  }

  /**
   * Check if both data channels are open and ready to send data.
   * @returns true if both channels are open and ready, false otherwise
   */
  public getChannelsReadiness() {
    return this.reliableChannel?.status === 'open' && this.lossyChannel?.status === 'open';
  }

  private createChannels(): void {
    this.createChannel('reliable');
    this.createChannel('lossy');
  }

  /**
   * Create a single data channel.
   * @private
   */
  private createChannel(type: DataChannelType): void {
    const channel = this.getOrCreateChannelWrapper(type);
    if (channel.status !== 'init') return;

    const label: string = type;
    const config = type === 'reliable' ? { ordered: true } : { ordered: false, maxRetransmits: 0 };
    const rtcChannel = this.createDataChannel(label, config);

    channel.setOnOpen(() => this.onChannelOpen(type));
    channel.setOnError((error) => this.onChannelError(type, error));
    channel.setChannel(rtcChannel);

    this.logger.warn(`Created ${type} data channel`);
  }

  /**
   * Called when a data channel opens.
   * Emits channelOpen event and checks if both channels are open.
   * @private
   */
  private onChannelOpen(type: DataChannelType): void {
    this.logger.warn(`Data channel ${type} opened`);
    this.emit('channelOpen', type);

    // Check if both channels are now open
    const bothReady =
      this.reliableChannel &&
      this.reliableChannel.status === 'open' &&
      this.lossyChannel &&
      this.lossyChannel.status === 'open';

    if (bothReady) {
      this.logger.warn('All data publishers ready');
      this.emit('ready');
    }
  }

  /**
   * Called when a data channel errors.
   * @private
   */
  private onChannelError(type: DataChannelType, error: Event): void {
    this.logger.error(`Data channel ${type} error:`, error);
    this.emit('error', type, error);
  }

  /**
   * Handle data received from a channel and emit the dataReceived event.
   * @param type - The type of channel the data was received on
   * @param data - The received binary data
   * @private
   */
  private onDataReceived(type: DataChannelType, data: Uint8Array): void {
    const payload: DataChannelMessagePayload = {
      channelType: type,
      data,
    };
    this.emit('data', payload);
  }

  /**
   * Get existing channel wrapper or create a new one (without RTCDataChannel).
   * @param type - The type of channel
   * @returns The DataChannel wrapper instance
   * @private
   */
  private getOrCreateChannelWrapper(type: DataChannelType): DataChannel {
    if (type === 'reliable') {
      if (!this.reliableChannel) {
        this.reliableChannel = new DataChannel(type, this.logger);
        this.reliableChannel.setCallback((data) => this.onDataReceived(type, data));
      }
      return this.reliableChannel;
    } else {
      if (!this.lossyChannel) {
        this.lossyChannel = new DataChannel(type, this.logger);
        this.lossyChannel.setCallback((data) => this.onDataReceived(type, data));
      }
      return this.lossyChannel;
    }
  }
}

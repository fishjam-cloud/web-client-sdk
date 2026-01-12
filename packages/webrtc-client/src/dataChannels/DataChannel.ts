import type { DataCallback, DataChannelStatus, DataChannelType, Logger } from '../types';

/**
 * Wrapper class for RTCDataChannel.
 * Handles bidirectional data transmission.
 * @internal
 */
export class DataChannel {
  private channel: RTCDataChannel | null = null;
  private dataCallback: DataCallback | null = null;
  private openCallback: (() => void) | null = null;
  private _status: DataChannelStatus = 'init';

  constructor(
    private readonly type: DataChannelType,
    private readonly logger: Logger,
  ) {}

  /**
   * Get the current status of the data channel
   */
  public get status(): DataChannelStatus {
    return this._status;
  }

  /**
   * Set the underlying RTCDataChannel and set up event listeners
   */
  public setChannel(channel: RTCDataChannel): void {
    this._status = 'creating';
    this.channel = channel;
    this.setupListeners();
  }

  /**
   * Set callback to be called when the channel is opened
   */
  public setOnOpen(callback: () => void): void {
    this.openCallback = callback;
  }

  /**
   * Send data through the channel
   * @param data - The data to send as Uint8Array
   */
  public send(data: Uint8Array): void {
    if (!this.channel || this._status !== 'open') {
      this.logger.warn(`Cannot send data on ${this.type} channel: channel not ready (status: ${this._status})`);
      return;
    }

    try {
      this.channel.send(data);
    } catch (error) {
      this.logger.error(`Error sending data on ${this.type} channel:`, error);
    }
  }

  /**
   * Set the callback for receiving data
   * @param callback - Function to call when data is received
   */
  public setCallback(callback: DataCallback): void {
    this.dataCallback = callback;
  }

  /**
   * Close the data channel
   */
  public close(): void {
    if (this.channel) {
      this.channel.close();
    }
    this._status = 'closed';
    this.dataCallback = null;
  }

  /**
   * Set up event listeners for the RTCDataChannel
   * @private
   */
  private setupListeners(): void {
    if (!this.channel) return;

    this.channel.onopen = () => {
      this._status = 'open';
      this.logger.debug(`Data channel ${this.type} opened`);
      this.openCallback?.();
    };

    this.channel.onclose = () => {
      this._status = 'closed';
      this.logger.debug(`Data channel ${this.type} closed`);
    };

    this.channel.onerror = (event) => {
      this.logger.error(`Data channel ${this.type} error:`, event);
    };

    this.channel.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  /**
   * Handle incoming message data
   * @private
   */
  private handleMessage(data: unknown): void {
    if (!this.dataCallback) {
      this.logger.warn(`Received data on ${this.type} channel but no callback is set`);
      return;
    }

    try {
      // Convert data to Uint8Array
      let uint8Data: Uint8Array;

      if (data instanceof ArrayBuffer) {
        uint8Data = new Uint8Array(data);
      } else if (data instanceof Uint8Array) {
        uint8Data = data;
      } else if (typeof data === 'string') {
        // Convert string to Uint8Array using TextEncoder
        uint8Data = new TextEncoder().encode(data);
      } else if (data instanceof Blob) {
        // For Blob, we need to read it asynchronously
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) {
            this.dataCallback?.(new Uint8Array(reader.result));
          }
        };
        reader.readAsArrayBuffer(data);
        return;
      } else {
        this.logger.warn(`Received unsupported data type on ${this.type} channel:`, typeof data);
        return;
      }

      this.dataCallback(uint8Data);
    } catch (error) {
      this.logger.error(`Error handling message on ${this.type} channel:`, error);
    }
  }
}

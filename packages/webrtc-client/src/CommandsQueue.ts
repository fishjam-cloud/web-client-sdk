import type { ConnectionManager } from './ConnectionManager';
import type { Deferred } from './deferred';
import type { LocalTrackManager } from './tracks/LocalTrackManager';

export type Command = {
  handler: () => Promise<void>;
  parse?: () => void;
  resolutionNotifier: Deferred<void>;
  resolve: 'after-renegotiation' | 'on-handler-resolve';
  /** Batchable commands may be executed while a renegotiation is pending (after
   * renegotiateTracks was sent, before the offer is created), so that multiple
   * tracks are negotiated in a single offer/answer cycle. */
  batchable?: boolean;
};

export class CommandsQueue {
  private readonly localTrackManager: LocalTrackManager;
  private connection: ConnectionManager | null = null;
  private clearConnectionCallbacks: (() => void) | null = null;

  constructor(localTrackManager: LocalTrackManager) {
    this.localTrackManager = localTrackManager;
  }

  public initConnection = (connection: ConnectionManager) => {
    this.connection = connection;

    const onSignalingStateChange = () => {
      if (connection.getConnection().signalingState === 'stable') {
        this.processNextCommand();
      }
    };

    const onIceGatheringStateChange = () => {
      if (connection.getConnection().iceGatheringState === 'complete') {
        this.processNextCommand();
      }
    };

    const onConnectionStateChange = () => {
      if (connection.getConnection().connectionState === 'connected') {
        this.processNextCommand();
      }
    };

    const onIceConnectionStateChange = () => {
      if (connection.getConnection().iceConnectionState === 'connected') {
        this.processNextCommand();
      }
    };

    this.clearConnectionCallbacks = () => {
      connection.getConnection().removeEventListener('signalingstatechange', onSignalingStateChange);
      connection.getConnection().removeEventListener('icegatheringstatechange', onIceGatheringStateChange);
      connection.getConnection().removeEventListener('connectionstatechange', onConnectionStateChange);
      connection.getConnection().removeEventListener('iceconnectionstatechange', onIceConnectionStateChange);
    };

    connection.getConnection().addEventListener('icegatheringstatechange', onIceConnectionStateChange);
    connection.getConnection().addEventListener('connectionstatechange', onConnectionStateChange);
    connection.getConnection().addEventListener('iceconnectionstatechange', onIceConnectionStateChange);
    connection.getConnection().addEventListener('signalingstatechange', onSignalingStateChange);
  };

  private commandsQueue: Command[] = [];
  private commandResolutionNotifiers: Deferred<void>[] = [];

  public pushCommand = (command: Command) => {
    this.commandsQueue.push(command);
    this.processNextCommand();
  };

  public processNextCommand = () => {
    if (this.localTrackManager.isNegotiationInProgress()) return;
    if (this.connection?.isConnectionUnstable()) return;

    this.resolvePreviousCommands();

    const command = this.commandsQueue.shift();

    if (!command) return;

    this.commandResolutionNotifiers.push(command.resolutionNotifier);
    this.handleCommand(command);
  };

  /**
   * Executes all queued batchable commands immediately, even while a renegotiation
   * is pending. Called from `onOfferData` right before the offer is created, so the
   * drained track additions are included in that single offer/answer cycle.
   *
   * Intentionally ignores `isNegotiationInProgress` (true by design at this point);
   * draining stops at the first non-batchable command to preserve command ordering.
   */
  public processBatchedCommands = () => {
    if (this.connection?.isConnectionUnstable()) return;

    while (this.commandsQueue[0]?.batchable) {
      const command = this.commandsQueue.shift()!;
      this.commandResolutionNotifiers.push(command.resolutionNotifier);
      this.handleCommand(command);
    }
  };

  private handleCommand = async (command: Command) => {
    try {
      command.parse?.();
      const promise = command.handler();

      if (command.resolve === 'on-handler-resolve') {
        await promise;
        this.resolveCommand(command.resolutionNotifier);
        this.processNextCommand();
      }
    } catch (error) {
      this.rejectCommand(command.resolutionNotifier, error);
      this.processNextCommand();
    }
  };

  private resolvePreviousCommands = () => {
    this.commandResolutionNotifiers.forEach((notifier) => notifier.resolve());
    this.commandResolutionNotifiers = [];
  };

  private resolveCommand = (notifier: Deferred<void>) => {
    notifier.resolve();
    this.commandResolutionNotifiers = this.commandResolutionNotifiers.filter((current) => current !== notifier);
  };

  private rejectCommand = (notifier: Deferred<void>, error: unknown) => {
    notifier.reject(error);
    this.commandResolutionNotifiers = this.commandResolutionNotifiers.filter((current) => current !== notifier);
  };

  public cleanUp = () => {
    this.commandResolutionNotifiers.forEach((notifier) => notifier.reject('Disconnected'));
    this.commandResolutionNotifiers = [];
    this.commandsQueue = [];
    this.clearConnectionCallbacks?.();
  };
}

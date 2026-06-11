import type { ConnectionManager } from './ConnectionManager';
import type { Deferred } from './deferred';
import type { LocalTrackManager } from './tracks/LocalTrackManager';

export type Command = {
  handler: () => Promise<void>;
  parse?: () => void;
  resolutionNotifier: Deferred<void>;
  resolve: 'after-renegotiation' | 'on-handler-resolve';
  /** May run while a renegotiation is pending, so several tracks share one offer/answer cycle. */
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
   * Drains queued batchable commands into the in-flight negotiation (called from `onOfferData`,
   * before the offer is created). Ignores `isNegotiationInProgress` by design; stops at the first
   * non-batchable command to preserve ordering.
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
      // Await even `after-renegotiation` handlers: they're `async () => <sync fn>`, so a throw
      // surfaces as a rejected promise that must be caught to reject the notifier (not hang it).
      await command.handler();

      if (command.resolve === 'on-handler-resolve') {
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

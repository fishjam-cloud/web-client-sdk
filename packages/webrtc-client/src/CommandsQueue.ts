import type { ConnectionManager } from './ConnectionManager';
import type { Deferred } from './deferred';
import type { LocalTrackManager } from './tracks/LocalTrackManager';

export type Command = {
  handler: () => Promise<void>;
  parse?: () => void;
  resolutionNotifier: Deferred<void>;
  resolve: 'after-renegotiation' | 'on-handler-resolve';
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
  private commandResolutionNotifier: Deferred<void> | null = null;

  public pushCommand = (command: Command) => {
    this.commandsQueue.push(command);
    this.processNextCommand();
  };

  public processNextCommand = () => {
    if (this.localTrackManager.isNegotiationInProgress()) return;
    if (this.connection?.isConnectionUnstable()) return;

    this.resolvePreviousCommand();

    const command = this.commandsQueue.shift();

    if (!command) return;

    this.commandResolutionNotifier = command.resolutionNotifier;
    this.handleCommand(command);
  };

  private handleCommand = async (command: Command) => {
    try {
      command.parse?.();
      const promise = command.handler();

      if (command.resolve === 'on-handler-resolve') {
        await promise;
        this.resolvePreviousCommand();
        this.processNextCommand();
      }
    } catch (error) {
      this.commandResolutionNotifier?.reject(error);
      this.commandResolutionNotifier = null;
      this.processNextCommand();
    }
  };

  private resolvePreviousCommand = () => {
    if (!this.commandResolutionNotifier) return;

    this.commandResolutionNotifier.resolve();
    this.commandResolutionNotifier = null;
  };

  public cleanUp = () => {
    this.commandResolutionNotifier?.reject('Disconnected');
    this.commandResolutionNotifier = null;
    this.commandsQueue = [];
    this.clearConnectionCallbacks?.();
  };
}

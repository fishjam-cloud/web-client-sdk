import type { Deferred } from './deferred';
import type { LocalTrackManager } from './tracks/LocalTrackManager';
import type { ConnectionManager } from './ConnectionManager';

export type Command = {
  handler: () => void;
  parse?: () => void;
  resolutionNotifier: Deferred<void>;
  resolve: 'after-renegotiation' | 'immediately';
};

export class CommandsQueue<EndpointMetadata, TrackMetadata> {
  private readonly localTrackManager: LocalTrackManager<
    EndpointMetadata,
    TrackMetadata
  >;
  private connection: ConnectionManager | null = null;
  private clearConnectionCallbacks: (() => void) | null = null;

  constructor(
    localTrackManager: LocalTrackManager<EndpointMetadata, TrackMetadata>,
  ) {
    this.localTrackManager = localTrackManager;
  }

  public initConnection = (connection: ConnectionManager) => {
    this.connection = connection;

    const onSignalingStateChange = () => {
      console.log("onSignalingStateChange", connection.getConnection().signalingState, this.commandsQueue);
      if (connection.getConnection().signalingState === 'stable') {
        this.processNextCommand();
      }
    };

    const onIceGatheringStateChange = () => {
      console.log("onIceGatheringStateChange", connection.getConnection().iceGatheringState, this.commandsQueue);
      if (connection.getConnection().iceGatheringState === 'complete') {
        this.processNextCommand();
      }
    };

    const onConnectionStateChange = () => {
      console.log("onConnectionStateChange", connection.getConnection().connectionState, this.commandsQueue);
      if (connection.getConnection().connectionState === 'connected') {
        this.processNextCommand();
      }
    };

    const onIceConnectionStateChange = () => {
      console.log("onIceConnectionStateChange", connection.getConnection().iceConnectionState, this.commandsQueue);
      if (connection.getConnection().iceConnectionState === 'connected') {
        this.processNextCommand();
      }
    };

    this.clearConnectionCallbacks = () => {
      connection
        .getConnection()
        .removeEventListener('signalingstatechange', onSignalingStateChange);
      connection
        .getConnection()
        .removeEventListener(
          'icegatheringstatechange',
          onIceGatheringStateChange,
        );
      connection
        .getConnection()
        .removeEventListener('connectionstatechange', onConnectionStateChange);
      connection
        .getConnection()
        .removeEventListener(
          'iceconnectionstatechange',
          onIceConnectionStateChange,
        );
    };

    connection
      .getConnection()
      .addEventListener('icegatheringstatechange', onIceConnectionStateChange);
    connection
      .getConnection()
      .addEventListener('connectionstatechange', onConnectionStateChange);
    connection
      .getConnection()
      .addEventListener('iceconnectionstatechange', onIceConnectionStateChange);
    connection
      .getConnection()
      .addEventListener('signalingstatechange', onSignalingStateChange);
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

  private handleCommand = (command: Command) => {
    try {
      command.parse?.();
      command.handler();

      if (command.resolve === 'immediately') {
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

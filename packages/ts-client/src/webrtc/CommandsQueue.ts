import type { Command } from './commands';
import type { Deferred } from './deferred';
import type { StateManager } from './StateManager';
import type { NegotiationManager } from './NegotiationManager';

export class CommandsQueue<EndpointMetadata, TrackMetadata> {
  private readonly stateManager: StateManager<EndpointMetadata, TrackMetadata>;
  private readonly negotiationManager: NegotiationManager;

  private clearConnectionCallbacks: (() => void) | null = null;

  constructor(
    stateManager: StateManager<EndpointMetadata, TrackMetadata>,
    negotiationManager: NegotiationManager,
  ) {
    this.stateManager = stateManager;
    this.negotiationManager = negotiationManager;
  }

  public setupEventListeners = (connection: RTCPeerConnection) => {
    const onSignalingStateChange = () => {
      switch (this.stateManager.connection?.signalingState) {
        case 'stable':
          this.processNextCommand();
          break;
      }
    };

    const onIceGatheringStateChange = () => {
      switch (this.stateManager.connection?.iceGatheringState) {
        case 'complete':
          this.processNextCommand();
          break;
      }
    };

    const onConnectionStateChange = () => {
      switch (connection.connectionState) {
        case 'connected':
          this.processNextCommand();
          break;
      }
    };
    const onIceConnectionStateChange = () => {
      switch (this.stateManager.connection?.iceConnectionState) {
        case 'connected':
          this.processNextCommand();
          break;
      }
    };

    this.clearConnectionCallbacks = () => {
      connection.removeEventListener(
        'signalingstatechange',
        onSignalingStateChange,
      );
      connection.removeEventListener(
        'icegatheringstatechange',
        onIceGatheringStateChange,
      );
      connection.removeEventListener(
        'connectionstatechange',
        onConnectionStateChange,
      );
      connection.removeEventListener(
        'iceconnectionstatechange',
        onIceConnectionStateChange,
      );
    };

    connection.addEventListener(
      'icegatheringstatechange',
      onIceConnectionStateChange,
    );
    connection.addEventListener(
      'connectionstatechange',
      onConnectionStateChange,
    );
    connection.addEventListener(
      'iceconnectionstatechange',
      onIceConnectionStateChange,
    );
    connection.addEventListener('signalingstatechange', onSignalingStateChange);
  };

  private commandsQueue: Command[] = [];
  private commandResolutionNotifier: Deferred<void> | null = null;

  public pushCommand = (command: Command) => {
    this.commandsQueue.push(command);
    this.processNextCommand();
  };

  private isConnectionUnstable = () => {
    const connection = this.stateManager.connection;
    if (connection === undefined) return false;

    const isSignalingUnstable = connection.signalingState !== 'stable';
    const isConnectionNotConnected = connection.connectionState !== 'connected';
    const isIceNotConnected = connection.iceConnectionState !== 'connected';

    return isSignalingUnstable && isConnectionNotConnected && isIceNotConnected;
  };

  private isNegotiationInProgress = () => {
    return (
      this.negotiationManager.ongoingRenegotiation ||
      this.stateManager.ongoingTrackReplacement
    );
  };

  public processNextCommand = () => {
    if (this.isNegotiationInProgress()) return;
    if (this.isConnectionUnstable()) return;

    this.resolvePreviousCommand();

    const command = this.commandsQueue.shift();

    if (!command) return;

    this.commandResolutionNotifier = command.resolutionNotifier;
    this.handleCommand(command);
  };

  private handleCommand = (command: Command) => {
    const error = command.validate?.();

    if (error) {
      this.commandResolutionNotifier?.reject(error);
      this.commandResolutionNotifier = null;
      this.processNextCommand();
    } else {
      command.handler();

      if (command.resolve === 'immediately') {
        this.resolvePreviousCommand();
        this.processNextCommand();
      }
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

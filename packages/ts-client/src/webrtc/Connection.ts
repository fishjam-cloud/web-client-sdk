import type { MediaStreamTrackId } from "./types";

export type TurnServer = {
  transport: string;
  password: string;
  serverAddr: string;
  serverPort: string;
  username: string;
};


export class Connection {
  public readonly connection: RTCPeerConnection;
  public rtcConfig: RTCConfiguration = { bundlePolicy: 'max-bundle', iceServers: [], iceTransportPolicy: 'relay' };

  constructor(config: TurnServer[]) {
    this.setTurns(config, this.rtcConfig)
    this.connection = new RTCPeerConnection(this.rtcConfig)
  }

  /**
   * Configures TURN servers for WebRTC connections by adding them to the provided RTCConfiguration object.
   */
  private setTurns = (turnServers: TurnServer[], rtcConfig: RTCConfiguration): void => {
    turnServers
      .map((turnServer: TurnServer) => {
        const transport =
          turnServer.transport === 'tls' ? 'tcp' : turnServer.transport;
        const uri = turnServer.transport === 'tls' ? 'turns' : 'turn';
        const address = turnServer.serverAddr;
        const port = turnServer.serverPort;

        return {
          credential: turnServer.password,
          urls: uri.concat(':', address, ':', port, '?transport=', transport),
          username: turnServer.username,
        } satisfies RTCIceServer;
      })
      .forEach((rtcIceServer) => {
        rtcConfig.iceServers!.push(rtcIceServer);
      });
  };

  public getConnection = (): RTCPeerConnection => {
    return this.connection;
  }

  public setTransceiversToReadOnly = () => {
    this.connection
      .getTransceivers()
      .forEach((transceiver) => (transceiver.direction = 'sendonly'));
  };

  public addTransceiversIfNeeded = (serverTracks: Map<string, number>,) => {
    const recvTransceivers = this.connection
      .getTransceivers()
      .filter((elem) => elem.direction === 'recvonly');

    ['audio', 'video']
      .flatMap((type) =>
        this.getNeededTransceiversTypes(type, recvTransceivers, serverTracks),
      )
      .forEach((kind) =>
        this.connection.addTransceiver(kind, { direction: 'recvonly' }),
      );
  };

  private getNeededTransceiversTypes = (type: string, recvTransceivers: RTCRtpTransceiver[], serverTracks: Map<string, number>,): string[] => {
    const typeNumber = serverTracks.get(type) ?? 0;

    const typeTransceiversNumber = recvTransceivers.filter(
      (elem) => elem.receiver.track.kind === type,
    ).length;

    return Array(typeNumber - typeTransceiversNumber).fill(type);
  };

  public addTransceiver = (track: MediaStreamTrack, transceiverConfig: RTCRtpTransceiverInit) => {
    this.connection.addTransceiver(track, transceiverConfig);
  }

  public setOnTrackReady = (onTrackReady: (event: RTCTrackEvent) => void) => {
    this.connection.ontrack = onTrackReady
  }
  public setRemoteDescription = async (data: any) => {
    await this.connection.setRemoteDescription(data)
  }

  public isTrackInUse = (track: MediaStreamTrack) => this.connection.getSenders().some((val) => val.track === track);

  public setTransceiverDirection = () => {
    this.connection
      .getTransceivers()
      .forEach((transceiver) => {
          transceiver.direction = transceiver.direction === 'sendrecv' ? 'sendonly' : transceiver.direction
        },
      );
  };

  public removeTrack = (sender: RTCRtpSender) => {
    this.connection.removeTrack(sender)
  }

  public findSender = (mediaStreamTrackId: MediaStreamTrackId): RTCRtpSender =>
    this.connection
      .getSenders()
      .find((sender) => sender.track && sender!.track!.id === mediaStreamTrackId)!;

  public addIceCandidate = async (iceCandidate: RTCIceCandidate) => {
    await this.connection.addIceCandidate(iceCandidate);
  }
}
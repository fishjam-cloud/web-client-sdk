import type { MediaEvent_OfferData_TrackTypes } from '@fishjam-cloud/protobufs/server';

import type { MediaStreamTrackId } from './types';

export class ConnectionManager {
  private readonly connection: RTCPeerConnection;
  public readonly pcId: string;

  constructor(iceServers: RTCIceServer[]) {
    this.connection = new RTCPeerConnection({
      bundlePolicy: 'max-bundle',
      iceServers: iceServers,
      iceTransportPolicy: 'all',
    });
    this.pcId = Math.random().toString(36).slice(2, 10);
    // eslint-disable-next-line no-console
    console.log('[DEBUG transceivers] new ConnectionManager', { pcId: this.pcId });
  }

  public isConnectionUnstable = () => {
    if (!this.connection) return false;

    const isSignalingUnstable = this.connection.signalingState !== 'stable';
    const isConnectionNotConnected = this.connection.connectionState !== 'connected';
    const isIceNotConnected = this.connection.iceConnectionState !== 'connected';

    return isSignalingUnstable && isConnectionNotConnected && isIceNotConnected;
  };

  public getConnection = (): RTCPeerConnection => {
    return this.connection;
  };

  public addTransceiversIfNeeded = (serverTracks: MediaEvent_OfferData_TrackTypes) => {
    const recvTransceivers = this.connection.getTransceivers().filter((elem) => elem.direction === 'recvonly');

    const videoTransceiversAmount = recvTransceivers.filter((elem) => elem.receiver.track.kind === 'video').length;
    const audioTransceiversAmount = recvTransceivers.filter((elem) => elem.receiver.track.kind === 'audio').length;

    const videoDelta = serverTracks.video - videoTransceiversAmount;
    const audioDelta = serverTracks.audio - audioTransceiversAmount;

    const snapBefore = this.connection.getTransceivers().map((t) => ({
      mid: t.mid,
      dir: t.direction,
      curDir: t.currentDirection,
      recvKind: t.receiver.track?.kind,
      sendKind: t.sender.track?.kind,
    }));

    // eslint-disable-next-line no-console
    console.log('[DEBUG transceivers] addTransceiversIfNeeded:before', {
      pcId: this.pcId,
      serverTracks: { video: serverTracks.video, audio: serverTracks.audio },
      videoTransceiversAmount,
      audioTransceiversAmount,
      videoDelta,
      audioDelta,
      totalTransceivers: snapBefore.length,
      snap: snapBefore,
    });

    if (videoDelta < 0 || audioDelta < 0) {
      // eslint-disable-next-line no-console
      console.warn('[DEBUG transceivers] NEGATIVE DELTA detected (serverTracks < recvonly transceivers)', {
        pcId: this.pcId,
        videoDelta,
        audioDelta,
      });
    }

    const videoNeededTypes = Array<string>(videoDelta).fill('video');
    const audioNeededTypes = Array<string>(audioDelta).fill('audio');

    [...videoNeededTypes, ...audioNeededTypes].forEach((kind) => {
      // eslint-disable-next-line no-console
      console.log('[DEBUG transceivers] addTransceiver(recvonly)', {
        pcId: this.pcId,
        kind,
        site: 'addTransceiversIfNeeded',
      });
      this.connection.addTransceiver(kind, { direction: 'recvonly' });
    });

    const snapAfter = this.connection.getTransceivers().map((t) => ({
      mid: t.mid,
      dir: t.direction,
      curDir: t.currentDirection,
      recvKind: t.receiver.track?.kind,
      sendKind: t.sender.track?.kind,
    }));
    // eslint-disable-next-line no-console
    console.log('[DEBUG transceivers] addTransceiversIfNeeded:after', {
      pcId: this.pcId,
      addedVideo: Math.max(0, videoDelta),
      addedAudio: Math.max(0, audioDelta),
      totalTransceivers: snapAfter.length,
      snap: snapAfter,
    });
  };

  public addTransceiver = (track: MediaStreamTrack, transceiverConfig: RTCRtpTransceiverInit) => {
    // eslint-disable-next-line no-console
    console.log('[DEBUG transceivers] addTransceiver(send)', {
      pcId: this.pcId,
      kind: track.kind,
      trackId: track.id,
      direction: transceiverConfig.direction,
      site: 'LocalTrack.addTrackToConnection',
    });
    this.connection.addTransceiver(track, transceiverConfig);
  };

  public setOnTrackReady = (onTrackReady: (event: RTCTrackEvent) => void) => {
    this.connection.ontrack = onTrackReady;
  };
  public setRemoteDescription = async (data: RTCSessionDescriptionInit) => {
    // eslint-disable-next-line no-console
    console.log('[DEBUG transceivers] setRemoteDescription:before', {
      pcId: this.pcId,
      type: data.type,
      signalingState: this.connection.signalingState,
      transceiverCount: this.connection.getTransceivers().length,
    });
    await this.connection.setRemoteDescription(data);
    const snap = this.connection.getTransceivers().map((t) => ({
      mid: t.mid,
      dir: t.direction,
      curDir: t.currentDirection,
      recvKind: t.receiver.track?.kind,
      sendKind: t.sender.track?.kind,
    }));
    // eslint-disable-next-line no-console
    console.log('[DEBUG transceivers] setRemoteDescription:after', {
      pcId: this.pcId,
      type: data.type,
      signalingState: this.connection.signalingState,
      transceiverCount: snap.length,
      snap,
    });
  };

  public isTrackInUse = (track: MediaStreamTrack) => this.connection.getSenders().some((val) => val.track === track);

  public removeTrack = (sender: RTCRtpSender) => {
    this.connection.removeTrack(sender);
  };

  public findSender = (mediaStreamTrackId: MediaStreamTrackId): RTCRtpSender =>
    this.connection.getSenders().find((sender) => sender.track && sender.track.id === mediaStreamTrackId)!;

  public addIceCandidate = async (iceCandidate: RTCIceCandidate) => {
    await this.connection.addIceCandidate(iceCandidate);
  };

  public createDataChannel = (label: string, config: RTCDataChannelInit): RTCDataChannel => {
    return this.connection.createDataChannel(label, config);
  };
}

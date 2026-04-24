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

    this.stopExcessRecvTransceivers('video', -videoDelta);
    this.stopExcessRecvTransceivers('audio', -audioDelta);

    const videoToAdd = Math.max(0, videoDelta);
    const audioToAdd = Math.max(0, audioDelta);

    const videoNeededTypes = Array<string>(videoToAdd).fill('video');
    const audioNeededTypes = Array<string>(audioToAdd).fill('audio');

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
      addedVideo: videoToAdd,
      addedAudio: audioToAdd,
      totalTransceivers: snapAfter.length,
      snap: snapAfter,
    });
  };

  private stopExcessRecvTransceivers = (kind: 'audio' | 'video', excess: number) => {
    if (excess <= 0) return;

    const candidates = this.connection
      .getTransceivers()
      .filter((t) => t.direction === 'recvonly' && t.receiver.track?.kind === kind)
      .sort((a, b) => {
        const aOrphan = a.mid === null ? 0 : 1;
        const bOrphan = b.mid === null ? 0 : 1;
        return aOrphan - bOrphan;
      });

    const toStop = candidates.slice(0, excess);
    toStop.forEach((transceiver) => {
      // eslint-disable-next-line no-console
      console.log('[DEBUG transceivers] stopExcess', {
        pcId: this.pcId,
        kind,
        mid: transceiver.mid,
      });
      transceiver.stop();
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

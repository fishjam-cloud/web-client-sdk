import type { FishjamClient, SimulcastConfig, TrackBandwidthLimit, TrackContext } from "@fishjam-cloud/ts-client";
import type { GenericMediaManager, GenericTrackManager } from "./types";
import type { Track } from "./state.types";

export class TrackManager<PeerMetadata, TrackMetadata> implements GenericTrackManager<TrackMetadata> {
  private mediaManager: GenericMediaManager;
  private tsClient: FishjamClient<PeerMetadata, TrackMetadata>;
  private currentTrackId: string | null = null;

  constructor(tsClient: FishjamClient<PeerMetadata, TrackMetadata>, deviceManager: GenericMediaManager) {
    this.mediaManager = deviceManager;
    this.tsClient = tsClient;
  }

  private getPreviousTrack = (): Track<TrackMetadata> => {
    if (!this.currentTrackId) throw Error("There is no current track id");

    const prevTrack = this.getRemoteTrack(this.currentTrackId);

    if (!prevTrack) throw Error("There is no previous track");

    return prevTrack;
  };

  public getCurrentTrack = (): Track<TrackMetadata> | null => {
    if (!this.currentTrackId) return null;
    return this.getRemoteTrack(this.currentTrackId);
  };

  private trackContextToTrack = (track: TrackContext<unknown, TrackMetadata>): Track<TrackMetadata> => ({
    rawMetadata: track.rawMetadata,
    metadata: track.metadata,
    trackId: track.trackId,
    stream: track.stream,
    simulcastConfig: track.simulcastConfig || null,
    encoding: track.encoding || null,
    vadStatus: track.vadStatus,
    track: track.track,
    metadataParsingError: track.metadataParsingError,
  });

  private getRemoteTrack = (remoteOrLocalTrackId: string): Track<TrackMetadata> | null => {
    const tracks = this.tsClient?.getLocalPeer()?.tracks;
    if (!tracks) return null;

    const trackByRemoteId = tracks?.get(remoteOrLocalTrackId);
    if (trackByRemoteId) return this.trackContextToTrack(trackByRemoteId);

    const trackByLocalId = [...tracks.values()].find((track) => track.track?.id === remoteOrLocalTrackId);
    return trackByLocalId ? this.trackContextToTrack(trackByLocalId) : null;
  };

  public initialize = async (deviceId?: string) => {
    this.mediaManager?.start(deviceId ?? true);
  };

  public cleanup = async () => {
    this?.mediaManager?.stop();
  };

  public startStreaming = async (
    trackMetadata?: TrackMetadata,
    simulcastConfig?: SimulcastConfig,
    maxBandwidth?: TrackBandwidthLimit,
  ) => {
    if (this.currentTrackId) throw Error("Track already added");

    const media = this.mediaManager.getMedia();

    if (!media || !media.stream || !media.track) throw Error("Device is unavailable");

    const track = this.getRemoteTrack(media.track.id);

    if (track) return track.trackId;

    // see `getRemoteTrack()` explanation
    this.currentTrackId = media.track.id;

    const remoteTrackId = await this.tsClient.addTrack(media.track, trackMetadata, simulcastConfig, maxBandwidth);

    this.currentTrackId = remoteTrackId;

    return remoteTrackId;
  };

  public refreshStreamedTrack = async () => {
    const prevTrack = this.getPreviousTrack();

    const newTrack = this.mediaManager.getTracks()[0];
    if (!newTrack) throw Error("New track is empty");

    return this.tsClient.replaceTrack(prevTrack.trackId, newTrack);
  };

  public stopStreaming = async () => {
    const prevTrack = this.getPreviousTrack();
    this.currentTrackId = null;
    return this.tsClient.removeTrack(prevTrack.trackId);
  };

  public pauseStreaming = async () => {
    const prevTrack = this.getPreviousTrack();
    await this.tsClient.replaceTrack(prevTrack.trackId, null);
  };

  public isMuted = () => {
    const media = this.mediaManager.getMedia();
    const isTrackDisabled = !media?.track?.enabled;
    const areMediaDisabled = !media?.enabled;

    return isTrackDisabled && areMediaDisabled;
  };

  public resumeStreaming = async () => {
    const prevTrack = this.getPreviousTrack();
    const media = this.mediaManager.getMedia();

    if (!media) throw Error("Device is unavailable");

    await this.tsClient.replaceTrack(prevTrack.trackId, media.track);
  };

  public disableTrack = async () => {
    this.mediaManager.disable();
  };

  public enableTrack = async () => {
    this.mediaManager.enable();
  };
}

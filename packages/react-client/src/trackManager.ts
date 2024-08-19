import type { FishjamClient, SimulcastConfig, TrackBandwidthLimit } from "@fishjam-cloud/ts-client";
import type { GenericMediaManager, GenericTrackManager } from "./types";
import type { Track } from "./state.types";
import { getRemoteOrLocalTrack } from "./utils/track";

export class TrackManager<PeerMetadata, TrackMetadata> implements GenericTrackManager<TrackMetadata> {
  private readonly mediaManager: GenericMediaManager;
  private readonly tsClient: FishjamClient<PeerMetadata, TrackMetadata>;
  private currentTrackId: string | null = null;

  constructor(tsClient: FishjamClient<PeerMetadata, TrackMetadata>, deviceManager: GenericMediaManager) {
    this.mediaManager = deviceManager;
    this.tsClient = tsClient;
  }

  private getPreviousTrack = (): Track<TrackMetadata> => {
    if (!this.currentTrackId) throw Error("There is no current track id");

    const prevTrack = getRemoteOrLocalTrack<PeerMetadata, TrackMetadata>(this.tsClient, this.currentTrackId);

    if (!prevTrack) throw Error("There is no previous track");

    return prevTrack;
  };

  public getCurrentTrack = (): Track<TrackMetadata> | null => {
    return getRemoteOrLocalTrack<PeerMetadata, TrackMetadata>(this.tsClient, this.currentTrackId);
  };

  public initialize = async (deviceId?: string) => {
    this.mediaManager?.start(deviceId ?? true);
  };

  public stop = async () => {
    this?.mediaManager?.stop();
  };

  public cleanup = () => {
    this.currentTrackId = null;
  };

  public startStreaming = async (
    trackMetadata?: TrackMetadata,
    simulcastConfig?: SimulcastConfig,
    maxBandwidth?: TrackBandwidthLimit,
  ) => {
    if (this.currentTrackId) throw Error("Track already added");

    const media = this.mediaManager.getMedia();

    if (!media || !media.stream || !media.track) throw Error("Device is unavailable");

    const track = getRemoteOrLocalTrack(this.tsClient, this.currentTrackId);

    if (track) return track.trackId;

    // see `getRemoteOrLocalTrackContext()` explanation
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

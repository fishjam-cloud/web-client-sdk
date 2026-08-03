import { type Logger, type TrackMetadata, TrackTypeError } from "@fishjam-cloud/ts-client";

import type { PlatformMediaStream, PlatformMediaStreamTrack } from "../devices/deviceManager";
import type { CustomSourceState, PeerStatus } from "../state/clientState";
import type { TrackPublisher } from "./TrackPublisher";

export type CustomSourceControllerDeps = {
  publisher: TrackPublisher;
  logger: Logger;
  getPeerStatus: () => PeerStatus;
  onStateChanged: () => void;
};

/**
 * Owns user-provided custom media sources. All mutations run through a promise
 * queue: replacing a source's stream issues an unpublish and a publish in the
 * same tick, and run concurrently they would race to remove the same track ids.
 */
export class CustomSourceController {
  private sources: Record<string, CustomSourceState> = {};
  private queue: Promise<unknown> = Promise.resolve();
  private readonly sessionCleanups: (() => void)[];

  public constructor(private readonly deps: CustomSourceControllerDeps) {
    this.sessionCleanups = [
      deps.publisher.onJoined(() => {
        void this.enqueue(() => this.publishPendingSources()).catch((error) =>
          this.deps.logger.error("Failed to publish custom sources", error),
        );
      }),
      deps.publisher.onDisconnected(() => {
        this.sources = Object.fromEntries(
          Object.entries(this.sources).map(([id, source]) => [id, { stream: source.stream }]),
        );
        this.notify();
      }),
    ];
  }

  public snapshot(): Record<string, CustomSourceState> {
    return this.sources;
  }

  public setSource(sourceId: string, stream: PlatformMediaStream | null): Promise<void> {
    return this.enqueue(() => this.applySetSource(sourceId, stream));
  }

  public dispose(): void {
    for (const cleanup of this.sessionCleanups) cleanup();
    this.sources = {};
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation);
    // Chain a never-rejecting link so one failed call cannot poison the queue;
    // the caller still observes failures through the returned promise.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async applySetSource(sourceId: string, stream: PlatformMediaStream | null): Promise<void> {
    const oldSource = this.sources[sourceId];
    if (stream === oldSource?.stream) return;

    if (oldSource?.trackIds) await this.removeTracks(oldSource.trackIds);

    if (stream !== null) {
      this.sources = { ...this.sources, [sourceId]: { stream } };
      this.notify();
      if (this.deps.getPeerStatus() === "connected") await this.publishPendingSources();
    } else if (oldSource) {
      this.sources = Object.fromEntries(Object.entries(this.sources).filter(([id]) => id !== sourceId));
      this.notify();
    }
  }

  private async publishPendingSources(): Promise<void> {
    const pending = Object.entries(this.sources).filter(([, source]) => source.trackIds === undefined);
    if (pending.length === 0) return;

    const published = await Promise.all(
      pending.map(async ([id, source]) => [id, await this.publishSource(source)] as const),
    );

    // The queue serializes mutations, but publishing awaits addTrack — verify
    // each entry is still the one we published before recording its track ids.
    const isStillCurrent = ([id, started]: (typeof published)[number]) => {
      const current = this.sources[id];
      return current !== undefined && current.stream === started.stream && current.trackIds === undefined;
    };
    const toPatch = published.filter(isStillCurrent);
    const orphans = published.filter((entry) => !isStillCurrent(entry));

    if (toPatch.length > 0) {
      this.sources = { ...this.sources, ...Object.fromEntries(toPatch) };
      this.notify();
    }
    for (const [, started] of orphans) {
      if (started.trackIds) await this.removeTracks(started.trackIds);
    }
  }

  private async publishSource(source: CustomSourceState): Promise<CustomSourceState> {
    const video = source.stream.getVideoTracks().at(0);
    const audio = source.stream.getAudioTracks().at(0);

    const displayName = this.deps.publisher.getDisplayName();
    const promises = [];
    if (video) promises.push(this.addTrack(video, { type: "customVideo", displayName, paused: false }));
    if (audio) promises.push(this.addTrack(audio, { type: "customAudio", displayName, paused: false }));

    if (promises.length === 0) {
      this.deps.logger.warn("Attempted to add empty PlatformMediaStream as custom source.");
      return source;
    }
    const [videoId, audioId] = await Promise.all(promises);
    return { ...source, trackIds: { videoId, audioId } };
  }

  private async removeTracks({ videoId, audioId }: { videoId?: string; audioId?: string }): Promise<void> {
    const promises = [];
    if (videoId) promises.push(this.deps.publisher.removeTrack(videoId));
    if (audioId) promises.push(this.deps.publisher.removeTrack(audioId));
    await Promise.all(promises);
  }

  private async addTrack(track: PlatformMediaStreamTrack, metadata: TrackMetadata): Promise<string | undefined> {
    try {
      return await this.deps.publisher.addTrack(track, metadata);
    } catch (err) {
      if (err instanceof TrackTypeError) {
        this.deps.logger.warn(err.message);
        return undefined;
      }
      throw err;
    }
  }

  private notify(): void {
    this.deps.onStateChanged();
  }
}

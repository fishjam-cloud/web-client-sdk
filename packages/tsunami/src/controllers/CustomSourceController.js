import { TrackTypeError } from "@fishjam-cloud/ts-client";
/**
 * Owns user-provided custom media sources. All mutations run through a promise
 * queue: replacing a source's stream issues an unpublish and a publish in the
 * same tick, and run concurrently they would race to remove the same track ids.
 */
export class CustomSourceController {
  deps;
  sources = {};
  queue = Promise.resolve();
  sessionCleanups;
  constructor(deps) {
    this.deps = deps;
    this.sessionCleanups = [
      deps.publisher.onJoined(() => {
        void this.enqueue(() => this.publishPendingSources()).catch((error) =>
          this.deps.logger.error("Failed to publish custom sources", error),
        );
      }),
      deps.publisher.onDisconnected(() => {
        const hasPublishedSources = Object.values(this.sources).some((source) => source.trackIds !== undefined);
        if (!hasPublishedSources) return;
        this.sources = Object.fromEntries(
          Object.entries(this.sources).map(([id, source]) => [id, { stream: source.stream }]),
        );
        this.notify();
      }),
    ];
  }
  snapshot() {
    return this.sources;
  }
  setSource(sourceId, stream) {
    return this.enqueue(() => this.applySetSource(sourceId, stream));
  }
  dispose() {
    for (const cleanup of this.sessionCleanups) cleanup();
    this.sources = {};
  }
  enqueue(operation) {
    const run = this.queue.then(operation);
    // Chain a never-rejecting link so one failed call cannot poison the queue;
    // the caller still observes failures through the returned promise.
    this.queue = run.catch(() => undefined);
    return run;
  }
  async applySetSource(sourceId, stream) {
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
  async publishPendingSources() {
    const pending = Object.entries(this.sources).filter(([, source]) => source.trackIds === undefined);
    if (pending.length === 0) return;
    const published = await Promise.all(pending.map(async ([id, source]) => [id, await this.publishSource(source)]));
    // The queue serializes mutations, but publishing awaits addTrack — verify
    // each entry is still the one we published before recording its track ids.
    const isStillCurrent = ([id, started]) => {
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
  async publishSource(source) {
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
  async removeTracks({ videoId, audioId }) {
    const promises = [];
    if (videoId) promises.push(this.deps.publisher.removeTrack(videoId));
    if (audioId) promises.push(this.deps.publisher.removeTrack(audioId));
    await Promise.all(promises);
  }
  async addTrack(track, metadata) {
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
  notify() {
    this.deps.onStateChanged();
  }
}

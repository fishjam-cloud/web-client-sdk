import { TrackTypeError } from "@fishjam-cloud/ts-client";
/** Owns the screen-share lifecycle: prompt, publish, middleware, teardown. */
export class ScreenShareController {
    deps;
    stream = null;
    trackIds = null;
    middleware = null;
    middlewareCleanup = null;
    trackEndCleanups = [];
    sessionCleanups;
    lastSnapshot = null;
    constructor(deps) {
        this.deps = deps;
        this.sessionCleanups = [
            deps.publisher.onDisconnected(() => {
                if (!this.stream)
                    return;
                void this.stop().catch((err) => this.deps.logger.error(err));
            }),
        ];
    }
    snapshot() {
        const [videoTrack, audioTrack] = this.stream ? getTracksFromStream(this.stream) : [null, null];
        const next = { stream: this.stream, videoTrack, audioTrack, middleware: this.middleware };
        const previous = this.lastSnapshot;
        const isUnchanged = previous &&
            previous.stream === next.stream &&
            previous.videoTrack === next.videoTrack &&
            previous.audioTrack === next.audioTrack &&
            previous.middleware === next.middleware;
        if (isUnchanged)
            return previous;
        this.lastSnapshot = next;
        return next;
    }
    async start(constraints) {
        const displayStream = await this.deps.deviceManager.getDisplayMedia({
            video: constraints?.videoConstraints ?? true,
            audio: constraints?.audioConstraints ?? true,
        });
        const displayName = this.deps.publisher.getDisplayName();
        let [video, audio] = getTracksFromStream(displayStream);
        if (this.middleware && video) {
            const { videoTrack, audioTrack, onClear } = await this.middleware(video, audio);
            video = videoTrack;
            audio = audioTrack;
            this.middlewareCleanup = onClear;
        }
        if (this.deps.publisher.isSignallingActive() && video) {
            const addTrackPromises = [this.addTrack(video, { displayName, type: "screenShareVideo", paused: false })];
            if (audio)
                addTrackPromises.push(this.addTrack(audio, { displayName, type: "screenShareAudio", paused: false }));
            const [videoId, audioId] = await Promise.all(addTrackPromises);
            this.stream = displayStream;
            this.trackIds = { videoId, audioId };
        }
        else {
            this.stream = displayStream;
            this.trackIds = {};
        }
        this.attachTrackEndListeners(displayStream);
        this.notify();
    }
    async stop() {
        if (!this.stream) {
            this.deps.logger.warn("No stream to stop");
            return;
        }
        const [video, audio] = getTracksFromStream(this.stream);
        video?.stop();
        audio?.stop();
        if (this.deps.getPeerStatus() === "connected") {
            const removeTrackPromises = [];
            if (this.trackIds?.videoId)
                removeTrackPromises.push(this.deps.publisher.removeTrack(this.trackIds.videoId));
            if (this.trackIds?.audioId)
                removeTrackPromises.push(this.deps.publisher.removeTrack(this.trackIds.audioId));
            await Promise.all(removeTrackPromises);
        }
        this.detachTrackEndListeners();
        this.middlewareCleanup?.();
        this.middlewareCleanup = null;
        this.stream = null;
        this.trackIds = null;
        this.notify();
    }
    async setMiddleware(middleware) {
        this.middleware = middleware;
        if (!this.stream) {
            this.notify();
            return;
        }
        const [video, audio] = getTracksFromStream(this.stream);
        if (!video)
            return;
        this.middlewareCleanup?.();
        this.middlewareCleanup = null;
        const { videoTrack, audioTrack, onClear } = (await middleware?.(video, audio)) ?? {
            videoTrack: video,
            audioTrack: audio,
            onClear: null,
        };
        this.middlewareCleanup = onClear;
        const replacePromises = [];
        if (videoTrack && this.trackIds?.videoId)
            replacePromises.push(this.deps.publisher.replaceTrack(this.trackIds.videoId, videoTrack));
        if (audioTrack && this.trackIds?.audioId)
            replacePromises.push(this.deps.publisher.replaceTrack(this.trackIds.audioId, audioTrack));
        await Promise.all(replacePromises);
        this.notify();
    }
    dispose() {
        for (const cleanup of this.sessionCleanups)
            cleanup();
        this.detachTrackEndListeners();
        this.middlewareCleanup?.();
        this.middlewareCleanup = null;
        if (this.stream) {
            const [video, audio] = getTracksFromStream(this.stream);
            video?.stop();
            audio?.stop();
        }
        this.stream = null;
        this.trackIds = null;
    }
    async addTrack(track, metadata) {
        try {
            return await this.deps.publisher.addTrack(track, metadata);
        }
        catch (err) {
            if (err instanceof TrackTypeError) {
                this.deps.logger.warn(err.message);
                return undefined;
            }
            throw err;
        }
    }
    attachTrackEndListeners(stream) {
        this.detachTrackEndListeners();
        const [video, audio] = getTracksFromStream(stream);
        const handleTrackEnded = () => {
            void this.stop().catch((err) => this.deps.logger.error(err));
        };
        for (const track of [video, audio]) {
            if (!track)
                continue;
            track.addEventListener?.("ended", handleTrackEnded);
            this.trackEndCleanups.push(() => track.removeEventListener?.("ended", handleTrackEnded));
        }
    }
    detachTrackEndListeners() {
        for (const cleanup of this.trackEndCleanups)
            cleanup();
        this.trackEndCleanups = [];
    }
    notify() {
        this.deps.onStateChanged();
    }
}
const getTracksFromStream = (stream) => {
    const video = stream.getVideoTracks()[0] ?? null;
    const audio = stream.getAudioTracks()[0] ?? null;
    return [video, audio];
};

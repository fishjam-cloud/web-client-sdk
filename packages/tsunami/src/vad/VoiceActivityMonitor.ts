import type { FishjamTrackContext, Peer } from "@fishjam-cloud/ts-client";

// Matches the backend's -32 dBov voice-activity threshold, converted to the
// linear [0, 1] scale of the WebRTC media-source audioLevel stat.
const SPEECH_THRESHOLD = 10 ** (-32 / 20);
const SILENCE_DEBOUNCE_TICKS = 2;
const LOCAL_POLL_INTERVAL_MS = 100;

export type VoiceActivityMonitorDeps = {
  getLocalPeer: () => Peer<unknown, unknown> | null;
  getRemotePeers: () => Record<string, Peer<unknown, unknown>>;
  getLocalTrackAudioLevel: (trackId: string) => Promise<{ level: number } | null>;
  /** Change notifications that re-scan peers and their microphone tracks. */
  subscribeToPeerChanges: (listener: () => void) => () => void;
};

const findMicrophoneTrack = (peer: Peer<unknown, unknown>): FishjamTrackContext | undefined =>
  [...peer.tracks.values()].find((trackContext) => trackContext.metadata?.type === "microphone");

/**
 * Voice activity for every peer with a published microphone track, keyed by
 * peer id. Kept OUTSIDE the client state store: local speech detection polls
 * at 10 Hz and remote activity flips per utterance — routing that through
 * state snapshots would notify every store subscriber.
 *
 * Remote activity mirrors the signalling `voiceActivityChanged` events; local
 * activity is detected by polling the microphone's audio level (speech is
 * reported instantly, silence after a short debounce). Polling runs only
 * while at least one subscriber is registered.
 */
export class VoiceActivityMonitor {
  private readonly listeners = new Set<() => void>();
  private snapshot: Record<string, boolean> = {};

  private peerChangesUnsubscribe: (() => void) | null = null;
  private readonly remoteTrackSubscriptions = new Map<string, { context: FishjamTrackContext; detach: () => void }>();

  private localMicrophoneTrackId: string | null = null;
  private localSpeaking = false;
  private pollAbort: AbortController | null = null;
  private pollTimeoutId: ReturnType<typeof setTimeout> | null = null;

  public constructor(private readonly deps: VoiceActivityMonitorDeps) {}

  public getSnapshot = (): Record<string, boolean> => this.snapshot;

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();

    return () => {
      if (!this.listeners.delete(listener)) return;
      if (this.listeners.size === 0) this.stop();
    };
  };

  public dispose(): void {
    this.stop();
    this.listeners.clear();
    this.snapshot = {};
  }

  private start(): void {
    this.peerChangesUnsubscribe = this.deps.subscribeToPeerChanges(() => this.synchronize());
    this.synchronize();
  }

  private stop(): void {
    this.peerChangesUnsubscribe?.();
    this.peerChangesUnsubscribe = null;
    for (const { detach } of this.remoteTrackSubscriptions.values()) detach();
    this.remoteTrackSubscriptions.clear();
    this.stopLocalPolling();
  }

  /** Re-scans peers, reconciling remote track listeners and the local poll. */
  private synchronize(): void {
    const remotePeers = this.deps.getRemotePeers();

    for (const [peerId, subscription] of this.remoteTrackSubscriptions) {
      const currentContext = remotePeers[peerId] && findMicrophoneTrack(remotePeers[peerId]);
      if (currentContext !== subscription.context) {
        subscription.detach();
        this.remoteTrackSubscriptions.delete(peerId);
      }
    }

    for (const [peerId, peer] of Object.entries(remotePeers)) {
      if (this.remoteTrackSubscriptions.has(peerId)) continue;
      const microphoneContext = findMicrophoneTrack(peer);
      if (!microphoneContext) continue;

      const onVoiceActivityChanged = () => this.recompute();
      microphoneContext.on("voiceActivityChanged", onVoiceActivityChanged);
      this.remoteTrackSubscriptions.set(peerId, {
        context: microphoneContext,
        detach: () => microphoneContext.off("voiceActivityChanged", onVoiceActivityChanged),
      });
    }

    const localMicrophoneTrackId = this.resolveLocalMicrophoneTrackId();
    if (localMicrophoneTrackId !== this.localMicrophoneTrackId) {
      this.localMicrophoneTrackId = localMicrophoneTrackId;
      this.stopLocalPolling();
      if (localMicrophoneTrackId) this.startLocalPolling(localMicrophoneTrackId);
    }

    this.recompute();
  }

  private resolveLocalMicrophoneTrackId(): string | null {
    const localPeer = this.deps.getLocalPeer();
    if (!localPeer) return null;
    return findMicrophoneTrack(localPeer)?.trackId ?? null;
  }

  private startLocalPolling(microphoneTrackId: string): void {
    const abort = new AbortController();
    this.pollAbort = abort;
    let silenceTicks = 0;

    const poll = async () => {
      if (abort.signal.aborted) return;

      const trackAudio = await this.deps.getLocalTrackAudioLevel(microphoneTrackId);
      if (abort.signal.aborted) return;

      if (trackAudio != null && trackAudio.level > SPEECH_THRESHOLD) {
        silenceTicks = 0;
        this.setLocalSpeaking(true);
      } else {
        silenceTicks += 1;
        if (silenceTicks >= SILENCE_DEBOUNCE_TICKS) this.setLocalSpeaking(false);
      }

      if (abort.signal.aborted) return;
      this.pollTimeoutId = setTimeout(() => void poll(), LOCAL_POLL_INTERVAL_MS);
    };

    this.pollTimeoutId = setTimeout(() => void poll(), 0);
  }

  private stopLocalPolling(): void {
    this.pollAbort?.abort();
    this.pollAbort = null;
    if (this.pollTimeoutId !== null) clearTimeout(this.pollTimeoutId);
    this.pollTimeoutId = null;
    this.localSpeaking = false;
  }

  private setLocalSpeaking(isSpeaking: boolean): void {
    if (this.localSpeaking === isSpeaking) return;
    this.localSpeaking = isSpeaking;
    this.recompute();
  }

  private recompute(): void {
    const next: Record<string, boolean> = {};

    for (const [peerId, peer] of Object.entries(this.deps.getRemotePeers())) {
      next[peerId] = findMicrophoneTrack(peer)?.vadStatus === "speech";
    }

    const localPeer = this.deps.getLocalPeer();
    if (localPeer && this.localMicrophoneTrackId) {
      next[localPeer.id] = this.localSpeaking;
    }

    const previous = this.snapshot;
    const previousKeys = Object.keys(previous);
    const nextKeys = Object.keys(next);
    const isUnchanged =
      previousKeys.length === nextKeys.length && nextKeys.every((key) => previous[key] === next[key]);
    if (isUnchanged) return;

    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  }
}

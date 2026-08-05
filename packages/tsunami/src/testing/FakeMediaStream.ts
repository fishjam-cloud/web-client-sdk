import { FakeMediaStreamTrack } from "fake-mediastreamtrack";

let streamCounter = 0;
let trackCounter = 0;

/** Minimal MediaStream implementation for tests running without media hardware. */
export class FakeMediaStream implements MediaStream {
  readonly id = `fake-stream-${streamCounter++}`;
  active = true;
  onaddtrack = null;
  onremovetrack = null;
  onactive = null;
  oninactive = null;

  private tracks: MediaStreamTrack[];

  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = [...tracks];
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === "video");
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === "audio");
  }

  getTrackById(id: string): MediaStreamTrack | null {
    return this.tracks.find((track) => track.id === id) ?? null;
  }

  addTrack(track: MediaStreamTrack): void {
    if (!this.tracks.includes(track)) this.tracks.push(track);
  }

  removeTrack(track: MediaStreamTrack): void {
    this.tracks = this.tracks.filter((candidate) => candidate !== track);
  }

  clone(): MediaStream {
    return new FakeMediaStream(this.tracks.map((track) => track.clone()));
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return true;
  }
}

export type FakeTrackOptions = {
  kind: "audio" | "video";
  deviceId?: string;
  label?: string;
};

/** Create a live track whose settings identify the device that produced it. */
export const createFakeTrack = ({
  kind,
  deviceId = `${kind}-device-default`,
  label = `${kind} track`,
}: FakeTrackOptions): FakeMediaStreamTrack =>
  new FakeMediaStreamTrack({
    kind,
    id: `${kind}-track-${trackCounter++}`,
    label,
    settings: { deviceId },
  });

export const createFakeStream = (tracks: FakeTrackOptions[]): FakeMediaStream =>
  new FakeMediaStream(tracks.map(createFakeTrack));

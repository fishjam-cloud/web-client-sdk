import { FakeMediaStreamTrack } from "fake-mediastreamtrack";
let streamCounter = 0;
let trackCounter = 0;
/**
 * Minimal `MediaStream` stand-in for jsdom (which ships none). Only the
 * surface the SDK touches is implemented: id, the get*Tracks accessors and
 * add/removeTrack. Modeled on the react-client test kit so both SDKs are
 * exercised by equivalent doubles.
 */
export class FakeMediaStream {
    id = `fake-stream-${streamCounter++}`;
    active = true;
    onaddtrack = null;
    onremovetrack = null;
    onactive = null;
    oninactive = null;
    tracks;
    constructor(tracks = []) {
        this.tracks = [...tracks];
    }
    getTracks() {
        return [...this.tracks];
    }
    getVideoTracks() {
        return this.tracks.filter((track) => track.kind === "video");
    }
    getAudioTracks() {
        return this.tracks.filter((track) => track.kind === "audio");
    }
    getTrackById(id) {
        return this.tracks.find((track) => track.id === id) ?? null;
    }
    addTrack(track) {
        if (!this.tracks.includes(track))
            this.tracks.push(track);
    }
    removeTrack(track) {
        this.tracks = this.tracks.filter((candidate) => candidate !== track);
    }
    clone() {
        // Real MediaStream.clone() clones the tracks too (new ids).
        return new FakeMediaStream(this.tracks.map((track) => track.clone()));
    }
    // EventTarget surface — unused by the SDK, present for type-compatibility.
    addEventListener() { }
    removeEventListener() { }
    dispatchEvent() {
        return true;
    }
}
/**
 * Create a fake track whose `getSettings().deviceId` reflects the device it
 * was acquired from — the device-manager logic keys off exactly this.
 */
export const createFakeTrack = ({ kind, deviceId = `${kind}-device-default`, label = `${kind} track`, }) => new FakeMediaStreamTrack({
    kind,
    id: `${kind}-track-${trackCounter++}`,
    label,
    settings: { deviceId },
});
export const createFakeStream = (tracks) => new FakeMediaStream(tracks.map(createFakeTrack));

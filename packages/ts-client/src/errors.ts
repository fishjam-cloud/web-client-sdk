export class TrackTypeError extends Error {
  constructor() {
    super(
      `Attempted to add video track to audio-only room. Please refer to the docs at https://docs.fishjam.io/audio-calls`,
    );
  }
}

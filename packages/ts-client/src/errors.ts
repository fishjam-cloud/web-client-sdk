export class TrackTypeError extends Error {
  constructor(trackType: string, allowedTrackTypes: string[]) {
    super(`Attempted to add ${trackType} track to room which only supports ${allowedTrackTypes.join(', ')}`);
  }
}

/**
 * Manages a shared {@link MediaStream} containing at most one video track and one audio track.
 *
 * Tracks sharing a `LocalStream` are grouped into the same LS (lip-sync) group in the SDP offer,
 * which lets the remote side treat them as belonging to the same source.
 *
 * When constructed with a source `MediaStream` that contains multiple tracks of the same kind
 * (e.g. a screen-capture stream with several audio tracks), only the **first** video and the
 * **first** audio track are retained.
 */
export class LocalStream {
  private readonly stream: MediaStream;

  constructor(sourceStream?: MediaStream) {
    this.stream = new MediaStream();

    if (!sourceStream) {
      return;
    }

    const video = sourceStream.getVideoTracks()[0];
    const audio = sourceStream.getAudioTracks()[0];
    if (video) this.stream.addTrack(video);
    if (audio) this.stream.addTrack(audio);
  }

  /**
   * Adds or replaces the video track in the stream.
   * If a video track is already present it is removed before the new one is added.
   */
  putVideoTrack(track: MediaStreamTrack): void {
    const existing = this.stream.getVideoTracks()[0];
    if (existing) this.stream.removeTrack(existing);
    this.stream.addTrack(track);
  }

  /**
   * Adds or replaces the audio track in the stream.
   * If an audio track is already present it is removed before the new one is added.
   */
  putAudioTrack(track: MediaStreamTrack): void {
    const existing = this.stream.getAudioTracks()[0];
    if (existing) this.stream.removeTrack(existing);
    this.stream.addTrack(track);
  }

  /** Removes the given track from the stream. No-op if the track is not in the stream. */
  removeTrack(track: MediaStreamTrack): void {
    this.stream.removeTrack(track);
  }

  /** Returns the underlying {@link MediaStream}. */
  getStream(): MediaStream {
    return this.stream;
  }

  getVideoTrack(): MediaStreamTrack | undefined {
    return this.stream.getVideoTracks()[0];
  }

  getAudioTrack(): MediaStreamTrack | undefined {
    return this.stream.getAudioTracks()[0];
  }

  /** Returns `true` when the stream contains no tracks. */
  isEmpty(): boolean {
    return this.stream.getTracks().length === 0;
  }
}

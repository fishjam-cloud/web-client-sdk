export type DeviceType = "audio" | "video";

export type DeviceItem = {
  deviceId: string;
  label: string;
  kind: DeviceType;
};

/** Optional storage for the last device selected for each media kind. */
export interface IDevicePersistence {
  getLastDevice(type: DeviceType): DeviceItem | null | Promise<DeviceItem | null>;
  saveLastDevice(type: DeviceType, device: DeviceItem): void | Promise<void>;
}

/**
 * Minimal track surface the SDK core relies on. Both the DOM
 * `MediaStreamTrack` and react-native-webrtc's `MediaStreamTrack` satisfy it
 * structurally, so the core never depends on either platform's full type.
 */
export interface PlatformMediaStreamTrack {
  readonly id: string;
  enabled: boolean;
  stop(): void;
  getSettings(): { deviceId?: string };
  // Optional because react-native-webrtc's bundled declarations do not expose
  // the listener methods inherited from its EventTarget shim (FCE-3689), even
  // though the runtime objects have them. Callers feature-detect at runtime.
  addEventListener?(type: "ended", listener: () => void): void;
  removeEventListener?(type: "ended", listener: () => void): void;
}

/** Minimal stream surface the SDK core relies on — see {@link PlatformMediaStreamTrack}. */
export interface PlatformMediaStream {
  getTracks(): PlatformMediaStreamTrack[];
  getVideoTracks(): PlatformMediaStreamTrack[];
  getAudioTracks(): PlatformMediaStreamTrack[];
}

/**
 * Platform boundary for local media acquisition.
 *
 * The SDK core uses this interface instead of accessing platform globals such
 * as `navigator.mediaDevices`, and only relies on the
 * {@link PlatformMediaStream} surface of the returned streams. Implementations
 * may use browser APIs, native APIs, or deterministic test doubles.
 *
 * `getUserMedia` and `getDisplayMedia` reject with a classified `DeviceError`
 * — platform error shapes never cross this boundary.
 *
 * @typeParam TMediaStream - Stream type returned by the target platform.
 */
export interface IDeviceManager<TMediaStream extends PlatformMediaStream = MediaStream> {
  readonly persistence?: IDevicePersistence;

  enumerateDevices(): Promise<DeviceItem[]>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<TMediaStream>;
  getDisplayMedia(options?: DisplayMediaStreamOptions): Promise<TMediaStream>;
  onDeviceChange(callback: () => void): () => void;
  /**
   * Wraps tracks in a platform stream, e.g. to make a middleware-processed
   * track renderable. Stream construction is a platform concern — the SDK
   * core never touches a `MediaStream` constructor.
   */
  createMediaStream(tracks: PlatformMediaStreamTrack[]): TMediaStream;
}

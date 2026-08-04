import { afterEach, describe, expect, it, vi } from 'vitest';

const ForkRTCPeerConnection = vi.hoisted(
  () =>
    class ForkRTCPeerConnection {
      setConfiguration() {}
    },
);
const ForkRTCIceCandidate = vi.hoisted(() => class ForkRTCIceCandidate {});
const ForkMediaStream = vi.hoisted(() => class ForkMediaStream {});

vi.mock('@fishjam-cloud/react-native-webrtc', () => ({
  RTCPeerConnection: ForkRTCPeerConnection,
  RTCIceCandidate: ForkRTCIceCandidate,
  MediaStream: ForkMediaStream,
}));
vi.mock('react-native', () => ({ NativeModules: { WebRTCModule: {} } }));
vi.mock('fast-text-encoding', () => ({}));
vi.mock('react-native-get-random-values', () => ({}));
vi.mock('react-native-url-polyfill/auto', () => ({}));

const removedGlobals = [
  'MediaStreamTrack',
  'RTCSessionDescription',
  'RTCCertificate',
  'RTCErrorEvent',
  'MediaStreamTrackEvent',
  'RTCRtpTransceiver',
  'RTCRtpSender',
  'RTCRtpReceiver',
] as const;

const globalRecord = globalThis as Record<string, unknown>;

describe('globals', () => {
  afterEach(() => {
    for (const name of ['RTCPeerConnection', 'RTCIceCandidate', 'MediaStream']) {
      delete globalRecord[name];
    }
    vi.resetModules();
  });

  it('installs exactly the three engine globals, nothing else', async () => {
    await import('./globals');

    // RTCPeerConnection is the SDK subclass (getConfiguration cache), built on the fork class.
    const InstalledPeerConnection = globalRecord.RTCPeerConnection as new (config: object) => {
      getConfiguration(): object;
    };
    expect(Object.getPrototypeOf(InstalledPeerConnection)).toBe(ForkRTCPeerConnection);
    const connection = new InstalledPeerConnection({ iceServers: [] });
    expect(connection.getConfiguration()).toEqual({ iceServers: [] });

    expect(globalRecord.RTCIceCandidate).toBe(ForkRTCIceCandidate);
    expect(globalRecord.MediaStream).toBe(ForkMediaStream);

    for (const name of removedGlobals) {
      expect(globalRecord[name], `${name} should not be installed`).toBeUndefined();
    }
    expect(globalRecord.localStorage, 'localStorage polyfill should be gone').toBeUndefined();
    expect(globalThis.navigator?.mediaDevices, 'navigator.mediaDevices fake should be gone').toBeUndefined();
  });
});

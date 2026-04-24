import { MediaEvent_OfferData } from '@fishjam-cloud/protobufs/server';
import { expect, it, vi } from 'vitest';

import { ConnectionManager } from '../src/ConnectionManager';

const makeTransceiver = (
  overrides: Partial<RTCRtpTransceiver> & { kind?: string; dir?: RTCRtpTransceiverDirection; mid?: string | null },
): RTCRtpTransceiver & { stop: ReturnType<typeof vi.fn> } => {
  const stop = vi.fn();
  const mid = 'mid' in overrides ? overrides.mid : 'someMid';
  const transceiver = {
    mid,
    direction: overrides.dir ?? 'recvonly',
    currentDirection: overrides.dir ?? 'recvonly',
    receiver: { track: { kind: overrides.kind ?? 'video' } } as RTCRtpReceiver,
    sender: { track: null } as unknown as RTCRtpSender,
    setCodecPreferences: () => {},
    stop,
  } as unknown as RTCRtpTransceiver & { stop: ReturnType<typeof vi.fn> };
  return transceiver;
};

const mockPcWithTransceivers = (initial: Array<RTCRtpTransceiver & { stop: ReturnType<typeof vi.fn> }>) => {
  const transceivers = [...initial];
  (global as any).RTCPeerConnection = class {
    getTransceivers() {
      return transceivers;
    }
    addTransceiver(kind: string): RTCRtpTransceiver {
      const t = makeTransceiver({ kind, dir: 'recvonly', mid: null });
      transceivers.push(t);
      return t;
    }
  };
  return transceivers;
};

it('clamps to zero when serverTracks equals current recvonly count', () => {
  const transceivers = mockPcWithTransceivers([
    makeTransceiver({ kind: 'video', dir: 'recvonly', mid: '0' }),
    makeTransceiver({ kind: 'audio', dir: 'recvonly', mid: '1' }),
  ]);

  const cm = new ConnectionManager([]);
  cm.addTransceiversIfNeeded(MediaEvent_OfferData.create({ tracksTypes: { video: 1, audio: 1 } }).tracksTypes!);

  expect(transceivers.length).toBe(2);
  expect((transceivers[0] as any).stop).not.toHaveBeenCalled();
  expect((transceivers[1] as any).stop).not.toHaveBeenCalled();
});

it('adds recvonly transceivers when serverTracks exceeds current count', () => {
  const transceivers = mockPcWithTransceivers([makeTransceiver({ kind: 'video', dir: 'recvonly', mid: '0' })]);

  const cm = new ConnectionManager([]);
  cm.addTransceiversIfNeeded(MediaEvent_OfferData.create({ tracksTypes: { video: 2, audio: 1 } }).tracksTypes!);

  expect(transceivers.length).toBe(3);
  expect(transceivers[1]!.receiver.track.kind).toBe('video');
  expect(transceivers[2]!.receiver.track.kind).toBe('audio');
});

it('stops excess recvonly transceivers when serverTracks is below current count', () => {
  const orphan = makeTransceiver({ kind: 'audio', dir: 'recvonly', mid: null });
  const negotiated = makeTransceiver({ kind: 'audio', dir: 'recvonly', mid: '3' });
  mockPcWithTransceivers([makeTransceiver({ kind: 'video', dir: 'recvonly', mid: '0' }), negotiated, orphan]);

  const cm = new ConnectionManager([]);
  cm.addTransceiversIfNeeded(MediaEvent_OfferData.create({ tracksTypes: { video: 1, audio: 1 } }).tracksTypes!);

  expect(orphan.stop).toHaveBeenCalled();
  expect(negotiated.stop).not.toHaveBeenCalled();
});

it('does not throw on negative delta (previously Array(-1) crash)', () => {
  mockPcWithTransceivers([
    makeTransceiver({ kind: 'video', dir: 'recvonly', mid: '0' }),
    makeTransceiver({ kind: 'video', dir: 'recvonly', mid: '1' }),
  ]);

  const cm = new ConnectionManager([]);
  expect(() =>
    cm.addTransceiversIfNeeded(MediaEvent_OfferData.create({ tracksTypes: { video: 1, audio: 0 } }).tracksTypes!),
  ).not.toThrow();
});

it('ignores stopped recvonly transceivers when counting so new ones are still added', () => {
  const stopped = makeTransceiver({ kind: 'video', dir: 'recvonly', mid: '0' });
  (stopped as unknown as { currentDirection: RTCRtpTransceiverDirection }).currentDirection = 'stopped';

  const transceivers = mockPcWithTransceivers([stopped]);

  const cm = new ConnectionManager([]);
  cm.addTransceiversIfNeeded(MediaEvent_OfferData.create({ tracksTypes: { video: 1, audio: 0 } }).tracksTypes!);

  expect(transceivers.length).toBe(2);
  expect(transceivers[1]!.receiver.track.kind).toBe('video');
  expect(stopped.stop).not.toHaveBeenCalled();
});

it('does not select stopped transceivers as stop candidates for excess', () => {
  const stopped = makeTransceiver({ kind: 'video', dir: 'recvonly', mid: '0' });
  (stopped as unknown as { currentDirection: RTCRtpTransceiverDirection }).currentDirection = 'stopped';
  const live = makeTransceiver({ kind: 'video', dir: 'recvonly', mid: '1' });
  const orphan = makeTransceiver({ kind: 'video', dir: 'recvonly', mid: null });

  mockPcWithTransceivers([stopped, live, orphan]);

  const cm = new ConnectionManager([]);
  cm.addTransceiversIfNeeded(MediaEvent_OfferData.create({ tracksTypes: { video: 1, audio: 0 } }).tracksTypes!);

  expect(stopped.stop).not.toHaveBeenCalled();
  expect(orphan.stop).toHaveBeenCalled();
  expect(live.stop).not.toHaveBeenCalled();
});

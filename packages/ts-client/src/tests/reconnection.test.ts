import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { FishjamClient } from '../FishjamClient';
import { ReconnectManager } from '../reconnection';
import type { GenericMetadata } from '../types';

function createMockClient() {
  const emitter = new EventEmitter();
  const client = Object.assign(emitter, {
    getLocalPeer: () => null,
    addTrack: vi.fn(),
  });
  return client as unknown as FishjamClient;
}

describe('ReconnectManager', () => {
  let client: FishjamClient;
  let connectFn: ReturnType<typeof vi.fn>;
  let manager: ReconnectManager<GenericMetadata, GenericMetadata>;

  beforeEach(() => {
    vi.useFakeTimers();
    client = createMockClient();
    connectFn = vi.fn();
  });

  afterEach(() => {
    manager?.cleanup();
    vi.useRealTimers();
  });

  function createManager(config: { maxAttempts: number; initialDelay: number; delay: number }) {
    manager = new ReconnectManager(client, connectFn, config);
    manager.reset(undefined);
    return manager;
  }

  function emitSocketClose(reason: string, code = 1000) {
    client.emit('socketClose', { reason, code, wasClean: true } as CloseEvent);
  }

  describe('stops reconnection on auth error during active reconnection', () => {
    test('transitions to error state when auth error received while reconnecting', () => {
      createManager({ maxAttempts: 5, initialDelay: 1000, delay: 0 });

      emitSocketClose('');
      expect(manager.isReconnecting()).toBe(true);

      const retriesLimitHandler = vi.fn();
      client.on('reconnectionRetriesLimitReached', retriesLimitHandler);

      emitSocketClose('invalid token');

      expect(manager.isReconnecting()).toBe(false);
      expect(retriesLimitHandler).not.toHaveBeenCalled();
    });

    test('transitions to error state when join error received while reconnecting', () => {
      createManager({ maxAttempts: 5, initialDelay: 1000, delay: 0 });

      emitSocketClose('');
      expect(manager.isReconnecting()).toBe(true);

      emitSocketClose('reached peers limit');

      expect(manager.isReconnecting()).toBe(false);
    });

    test('does not schedule further reconnection attempts after auth error', () => {
      createManager({ maxAttempts: 5, initialDelay: 100, delay: 0 });

      emitSocketClose('');
      expect(manager.isReconnecting()).toBe(true);

      emitSocketClose('room not found');

      vi.advanceTimersByTime(5000);
      expect(connectFn).not.toHaveBeenCalled();
    });

    test('clears pending timeout when auth error arrives', () => {
      createManager({ maxAttempts: 5, initialDelay: 1000, delay: 0 });

      emitSocketClose('');
      expect(manager.isReconnecting()).toBe(true);

      emitSocketClose('peer not found');

      vi.advanceTimersByTime(5000);
      expect(connectFn).not.toHaveBeenCalled();
    });

    test('handles case-insensitive auth error "Invalid token" during reconnection', () => {
      createManager({ maxAttempts: 5, initialDelay: 1000, delay: 0 });

      emitSocketClose('');
      expect(manager.isReconnecting()).toBe(true);

      emitSocketClose('Invalid token');

      expect(manager.isReconnecting()).toBe(false);
    });
  });

  describe('does not restart reconnection after auth error abort', () => {
    test('connectionError after auth-error close does not restart reconnection', () => {
      createManager({ maxAttempts: 5, initialDelay: 1000, delay: 0 });

      emitSocketClose('');
      expect(manager.isReconnecting()).toBe(true);

      emitSocketClose('invalid token');
      expect(manager.isReconnecting()).toBe(false);

      client.emit('connectionError', { message: 'connection failed' });

      expect(manager.isReconnecting()).toBe(false);
      vi.advanceTimersByTime(5000);
      expect(connectFn).not.toHaveBeenCalled();
    });

    test('socketError after auth-error close does not restart reconnection', () => {
      createManager({ maxAttempts: 5, initialDelay: 1000, delay: 0 });

      emitSocketClose('');
      expect(manager.isReconnecting()).toBe(true);

      emitSocketClose('invalid token');
      expect(manager.isReconnecting()).toBe(false);

      client.emit('socketError', new Event('error'));

      expect(manager.isReconnecting()).toBe(false);
      vi.advanceTimersByTime(5000);
      expect(connectFn).not.toHaveBeenCalled();
    });
  });

  describe('does not interfere with non-reconnecting state', () => {
    test('auth error while idle does not change state', () => {
      createManager({ maxAttempts: 5, initialDelay: 1000, delay: 0 });

      expect(manager.isReconnecting()).toBe(false);

      emitSocketClose('invalid token');

      expect(manager.isReconnecting()).toBe(false);
    });
  });

  describe('normal reconnection still works', () => {
    test('reconnects on non-auth socket close', () => {
      createManager({ maxAttempts: 3, initialDelay: 100, delay: 0 });

      emitSocketClose('');
      expect(manager.isReconnecting()).toBe(true);

      vi.advanceTimersByTime(100);
      expect(connectFn).toHaveBeenCalledTimes(1);
    });

    test('emits reconnectionRetriesLimitReached when max attempts exhausted', () => {
      createManager({ maxAttempts: 1, initialDelay: 100, delay: 0 });

      const retriesLimitHandler = vi.fn();
      client.on('reconnectionRetriesLimitReached', retriesLimitHandler);

      emitSocketClose('');
      vi.advanceTimersByTime(100);

      emitSocketClose('');

      expect(retriesLimitHandler).toHaveBeenCalledTimes(1);
    });
  });
});

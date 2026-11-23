import { EventEmitter } from 'events';
import { describe, expect, test } from 'vitest';

import { connectEventsHandler } from '../connectEventsHandler';
import { JoinRoomError } from '../errors';
import type { FishjamClient } from '../FishjamClient';

function createMockClient() {
  return new EventEmitter() as unknown as FishjamClient;
}

function closeEvent(reason: string, code = 1006) {
  return { reason, code, wasClean: false } as CloseEvent;
}

async function getRejection(promise: Promise<void>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(JoinRoomError);
  return error as JoinRoomError;
}

describe('connectEventsHandler', () => {
  test('resolves when joined', async () => {
    const client = createMockClient();
    const result = connectEventsHandler(client);

    client.emit('joined', 'peer-id', [], []);

    await expect(result).resolves.toBeUndefined();
  });

  test('rejects with auth_error and the reason as cause', async () => {
    const client = createMockClient();
    const result = connectEventsHandler(client);

    client.emit('authError', 'invalid token');
    client.emit('socketClose', closeEvent('invalid token', 1000));

    const error = await getRejection(result);
    expect(error.type).toBe('auth_error');
    expect(error.cause).toBe('invalid token');
  });

  test('rejects with join_error and the reason as cause', async () => {
    const client = createMockClient();
    const result = connectEventsHandler(client);

    client.emit('joinError', 'reached peers limit');
    client.emit('socketClose', closeEvent('reached peers limit', 1000));

    const error = await getRejection(result);
    expect(error.type).toBe('join_error');
    expect(error.cause).toBe('reached peers limit');
  });

  test('rejects with socket_error when the socket fails', async () => {
    const client = createMockClient();
    const result = connectEventsHandler(client);
    const event = closeEvent(
      'java.security.cert.CertPathValidatorException: Trust anchor for certification path not found.',
    );

    client.emit('socketError', new Event('error'));
    client.emit('socketClose', event);

    const error = await getRejection(result);
    expect(error.type).toBe('socket_error');
    expect(error.cause).toBe(event);
  });

  test('rejects with socket_closed when the socket closes before joined', async () => {
    const client = createMockClient();
    const result = connectEventsHandler(client);
    const event = closeEvent('unexpected reason', 1011);

    client.emit('socketClose', event);

    const error = await getRejection(result);
    expect(error.type).toBe('socket_closed');
    expect(error.cause).toBe(event);
  });

  test('removes its listeners once settled', async () => {
    const client = createMockClient();
    const result = connectEventsHandler(client);

    client.emit('joined', 'peer-id', [], []);
    await result;

    for (const event of ['joined', 'joinError', 'authError', 'socketError', 'socketClose'] as const) {
      expect(client.listenerCount(event)).toBe(0);
    }
  });
});

import { beforeEach, describe, expect, test, vi } from 'vitest';

import { MessageQueue } from '../messageQueue';

describe('Message queue tests', () => {
  let isReconnecting = false;

  beforeEach(() => {
    isReconnecting = false;
  });

  const getQueueWithUtils = () => {
    const sendMessage = vi.fn();

    const queue = new MessageQueue({ sendMessage, checkIsReconnecting: () => isReconnecting });

    const message1 = new Uint8Array([1, 2, 3]);
    const message2 = new Uint8Array([4, 5, 6]);

    return { sendMessage, queue, message1, message2 };
  };

  test('Queue dispatches messages while not reconnecting', () => {
    const { queue, sendMessage, message1, message2 } = getQueueWithUtils();

    queue.enqueueMessage(message1);
    queue.enqueueMessage(message2);

    expect(sendMessage).toHaveBeenCalledWith(message1);
    expect(sendMessage).toHaveBeenCalledWith(message2);
  });

  test('Queue holds messages while reconnecting', () => {
    const { queue, sendMessage, message1, message2 } = getQueueWithUtils();

    isReconnecting = true;
    queue.enqueueMessage(message1);
    queue.enqueueMessage(message2);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('Queue dispatches all messages upon calling attemptToSendOut', async () => {
    const { queue, sendMessage, message1, message2 } = getQueueWithUtils();
    isReconnecting = true;

    queue.enqueueMessage(message1);
    queue.enqueueMessage(message2);

    isReconnecting = false;

    // attemptToSendOut not called yet
    expect(sendMessage).not.toHaveBeenCalled();

    queue.attemptToSendAll();

    // all messages dispatched
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  test('Queue dispatches all messages upon enqueuing another event', async () => {
    const { queue, sendMessage, message1, message2 } = getQueueWithUtils();
    isReconnecting = true;

    queue.enqueueMessage(message1);
    queue.enqueueMessage(message2);

    isReconnecting = false;

    // no trigger to send out yet
    expect(sendMessage).not.toHaveBeenCalled();

    const anotherMessage = new Uint8Array([7, 8, 9]);
    queue.enqueueMessage(anotherMessage);

    // all messages dispatched
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });
});

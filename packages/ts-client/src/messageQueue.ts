type MessageQueueParams = {
  checkIsReconnecting: () => boolean;
  sendMessage: (message: Uint8Array) => void;
};

export class MessageQueue {
  private queuedMessages: Uint8Array[] = [];
  private checkIsReconnecting: MessageQueueParams['checkIsReconnecting'];
  private sendMessage: MessageQueueParams['sendMessage'];

  constructor({ checkIsReconnecting, sendMessage }: MessageQueueParams) {
    this.checkIsReconnecting = checkIsReconnecting;
    this.sendMessage = sendMessage;
  }

  public enqueueMessage(mediaEvent: Uint8Array) {
    this.queuedMessages.push(mediaEvent);
    this.attemptToSendAll();
  }

  public attemptToSendAll() {
    const isReconnecting = this.checkIsReconnecting();
    if (isReconnecting) return;

    while (this.queuedMessages.length > 0) {
      const oldestMessage = this.queuedMessages.shift();
      if (oldestMessage) this.sendMessage(oldestMessage);
    }
  }
}

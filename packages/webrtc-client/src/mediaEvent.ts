import { MediaEvent as PeerMediaEvent } from '@fishjam-cloud/protobufs/peer';
import { MediaEvent as ServerMediaEvent } from '@fishjam-cloud/protobufs/server';

export type SerializedMediaEvent = Uint8Array;

export interface MediaEvent {
  type: keyof PeerMediaEvent;
  key?: string;
  data?: any;
}

export function serializePeerMediaEvent(mediaEvent: PeerMediaEvent): Uint8Array {
  const encodedEvent = PeerMediaEvent.encode(mediaEvent).finish();
  return encodedEvent;
}

export function serializeServerMediaEvent(mediaEvent: ServerMediaEvent): Uint8Array {
  const encodedEvent = ServerMediaEvent.encode(mediaEvent).finish();
  return encodedEvent;
}

export function deserializeServerMediaEvent(serializedMediaEvent: SerializedMediaEvent): ServerMediaEvent {
  return ServerMediaEvent.decode(serializedMediaEvent);
}

export function deserializePeerMediaEvent(serializedMediaEvent: SerializedMediaEvent): PeerMediaEvent {
  return PeerMediaEvent.decode(serializedMediaEvent);
}

export function generateMediaEvent<T extends keyof PeerMediaEvent>(type: T, data?: PeerMediaEvent[T]): MediaEvent {
  const mediaEvent: MediaEvent = { type, data };

  return mediaEvent;
}

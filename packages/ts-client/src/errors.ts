export class TrackTypeError extends Error {
  constructor() {
    super(
      `Attempted to add video track to audio-only room. Please refer to the docs at https://docs.fishjam.io/audio-calls`,
    );
  }
}

export type JoinRoomErrorType =
  'untrusted_certificate' | 'socket_error' | 'socket_closed' | 'auth_error' | 'join_error';

export class JoinRoomError extends Error {
  readonly type: JoinRoomErrorType;

  constructor(type: JoinRoomErrorType, cause: unknown) {
    super(`Failed to join the room: ${type}`, { cause });
    this.name = 'JoinRoomError';
    this.type = type;
  }
}

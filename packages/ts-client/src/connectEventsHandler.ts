import type { AuthErrorReason } from './auth';
import { JoinRoomError, type JoinRoomErrorType } from './errors';
import type { FishjamClient } from './FishjamClient';

export function connectEventsHandler<P, S>(fishjamClient: FishjamClient<P, S>) {
  return new Promise<void>((resolve, reject) => {
    const onSuccess = () => {
      clearCallbacks();
      resolve();
    };
    const fail = (type: JoinRoomErrorType, cause: unknown) => {
      clearCallbacks();
      reject(new JoinRoomError(type, cause));
    };
    const onAuthError = (reason: AuthErrorReason) => fail('auth_error', reason);
    const onJoinError = (metadata: unknown) => fail('join_error', metadata);
    const onSocketClose = (event: CloseEvent) => fail('socket_closed', event);

    fishjamClient.on('joined', onSuccess);
    fishjamClient.on('joinError', onJoinError);
    fishjamClient.on('authError', onAuthError);
    fishjamClient.on('socketClose', onSocketClose);

    const clearCallbacks = () => {
      fishjamClient.removeListener('joined', onSuccess);
      fishjamClient.removeListener('joinError', onJoinError);
      fishjamClient.removeListener('authError', onAuthError);
      fishjamClient.removeListener('socketClose', onSocketClose);
    };
  });
}

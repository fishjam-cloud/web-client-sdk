import type { AuthErrorReason } from './auth';
import { JoinRoomError, type JoinRoomErrorType } from './errors';
import type { FishjamClient } from './FishjamClient';

const UNTRUSTED_CERTIFICATE_REASON = /certificate|CertPathValidatorException|OSStatus error -98(07|08|12|13|14|15)\b/i;

const getSocketCloseErrorType = (event: CloseEvent, socketErrored: boolean): JoinRoomErrorType => {
  if (UNTRUSTED_CERTIFICATE_REASON.test(event.reason)) return 'untrusted_certificate';
  return socketErrored ? 'socket_error' : 'socket_closed';
};

export function connectEventsHandler<P, S>(fishjamClient: FishjamClient<P, S>) {
  return new Promise<void>((resolve, reject) => {
    let socketErrored = false;

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
    const onSocketError = () => {
      socketErrored = true;
    };
    const onSocketClose = (event: CloseEvent) => fail(getSocketCloseErrorType(event, socketErrored), event);

    fishjamClient.on('joined', onSuccess);
    fishjamClient.on('joinError', onJoinError);
    fishjamClient.on('authError', onAuthError);
    fishjamClient.on('socketError', onSocketError);
    fishjamClient.on('socketClose', onSocketClose);

    const clearCallbacks = () => {
      fishjamClient.removeListener('joined', onSuccess);
      fishjamClient.removeListener('joinError', onJoinError);
      fishjamClient.removeListener('authError', onAuthError);
      fishjamClient.removeListener('socketError', onSocketError);
      fishjamClient.removeListener('socketClose', onSocketClose);
    };
  });
}

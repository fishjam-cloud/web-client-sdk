import type { FishjamClient } from './FishjamClient';

export function connectEventsHandler<P, S>(fishjamClient: FishjamClient<P, S>) {
  return new Promise<void>((resolve, reject) => {
    const onSuccess = () => {
      clearCallbacks();
      resolve();
    };
    const onError = () => {
      clearCallbacks();
      reject();
    };

    fishjamClient.on('joined', onSuccess);
    fishjamClient.on('joinError', onError);
    fishjamClient.on('authError', onError);
    fishjamClient.on('socketError', onError);

    const clearCallbacks = () => {
      fishjamClient.removeListener('joined', onSuccess);
      fishjamClient.removeListener('joinError', onError);
      fishjamClient.removeListener('authError', onError);
      fishjamClient.removeListener('socketError', onError);
    };
  });
}

import {
  type CallKitAction,
  useCallKitEvent as useCallKitEventSdk,
} from '@fishjam-cloud/react-native-client';

export type VoipIncomingPayload = { roomId: string; username: string };

/**
 * Just the temporary example to demostrate how the new api should look like
 */
export type ExtendedCallKitAction = CallKitAction & {
  incoming?: VoipIncomingPayload;
  answer?: undefined;
  end?: undefined;
  registered?: string; // device id / VoIP push token
};

export const useCallKitEvent = useCallKitEventSdk as <
  T extends keyof ExtendedCallKitAction,
>(
  action: T,
  callback: (event: ExtendedCallKitAction[T]) => void,
) => void;

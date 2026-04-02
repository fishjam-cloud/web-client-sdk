import 'fast-text-encoding';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { EventTarget, registerGlobals } from '@fishjam-cloud/react-native-webrtc';

import { patchGetUserMediaWithPermissionWarnings } from './overrides/getUserMedia';
import { RTCPeerConnection } from './overrides/RTCPeerConnection';
import { LocalStoragePolyfill } from './polyfills/local-storage';

const registerGlobalsPolyfill = () => {
  (global as unknown as { EventTarget: typeof EventTarget }).EventTarget = EventTarget;
  (global as unknown as { localStorage: typeof localStorage }).localStorage = new LocalStoragePolyfill();
  registerGlobals();
  // Custom overrides
  (globalThis.RTCPeerConnection as unknown as typeof RTCPeerConnection) = RTCPeerConnection;
  patchGetUserMediaWithPermissionWarnings();
};

registerGlobalsPolyfill();

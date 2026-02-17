import 'fast-text-encoding';
import 'react-native-get-random-values';

import { registerGlobals } from '@fishjam-cloud/react-native-webrtc';
// @ts-ignore - event-target-shim types not properly exported via package.json exports
import { EventTarget } from 'event-target-shim';

import { RTCPeerConnection } from './overrides/RTCPeerConnection';
import { LocalStoragePolyfill } from './polyfills/local-storage';

const registerGlobalsPolyfill = () => {
  (global as unknown as { EventTarget: typeof EventTarget }).EventTarget = EventTarget;
  (global as unknown as { localStorage: typeof localStorage }).localStorage = new LocalStoragePolyfill();
  registerGlobals();
  // Custom overrides
  (globalThis.RTCPeerConnection as unknown as typeof RTCPeerConnection) = RTCPeerConnection;
};

registerGlobalsPolyfill();

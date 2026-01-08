// @ts-ignore - event-target-shim types not properly exported via package.json exports
import { EventTarget } from 'event-target-shim';

import { registerGlobals } from '@fishjam-cloud/react-native-webrtc';

import { RTCPeerConnection } from './overrides/RTCPeerConnection';
import { LocalStoragePolyfill } from './polyfills/local-storage';

const registerGlobalsPolyfill = () => {
  (global as unknown as { EventTarget: typeof EventTarget }).EventTarget = EventTarget;
  (global as unknown as { localStorage: typeof localStorage }).localStorage = new LocalStoragePolyfill();
  (global as unknown as { crypto: { getRandomValues: (array: Uint8Array) => void } }).crypto = {
    getRandomValues: function (array: Uint8Array) {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    },
  };

  // TODO: FCE-2467 Implement proper polyfill for crypto
  (global as unknown as { crypto: { getRandomValues: (array: Uint8Array) => void } }).crypto.getRandomValues =
    function (array: Uint8Array) {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    };

  registerGlobals();
  // Custom overrides
  (globalThis.RTCPeerConnection as unknown as typeof RTCPeerConnection) = RTCPeerConnection;
};

registerGlobalsPolyfill();

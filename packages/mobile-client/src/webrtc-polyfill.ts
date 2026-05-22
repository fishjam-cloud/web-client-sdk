import 'fast-text-encoding';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { EventTarget, registerGlobals } from '@fishjam-cloud/react-native-webrtc';
import { NativeModules } from 'react-native';

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

const assertReactNativeWebRTCNativeModule = () => {
  if (NativeModules.WebRTCModule) return;
  throw new Error(
    '@fishjam-cloud/react-native-client: the native module for `@fishjam-cloud/react-native-webrtc` is not linked. ' +
      'Install the package and rebuild your native app:\n' +
      '  1. yarn add @fishjam-cloud/react-native-webrtc\n' +
      '  2. cd ios && pod install (bare React Native)\n' +
      '     or: npx expo prebuild --clean && rebuild your dev client (Expo)',
  );
};

const assertGetRandomValuesPolyfill = () => {
  try {
    if (typeof globalThis.crypto?.getRandomValues !== 'function') {
      throw new Error('crypto.getRandomValues is undefined');
    }
    globalThis.crypto.getRandomValues(new Uint8Array(1));
  } catch (cause) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      '@fishjam-cloud/react-native-client: `react-native-get-random-values` is not installed or its native module is not linked. ' +
        'Install the package and rebuild your native app:\n' +
        '  1. yarn add react-native-get-random-values\n' +
        '  2. cd ios && pod install (bare React Native)\n' +
        '     or: npx expo prebuild --clean && rebuild your dev client (Expo)\n' +
        `Underlying error: ${causeMessage}`,
    );
  }
};

registerGlobalsPolyfill();
assertReactNativeWebRTCNativeModule();
assertGetRandomValuesPolyfill();

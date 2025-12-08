// @ts-ignore - event-target-shim types not properly exported via package.json exports
import { EventTarget } from "event-target-shim";
import {
  registerGlobals,
} from "react-native-webrtc";

import { RTCPeerConnection } from "./overrides/RTCPeerConnection";

// TODO: FCE-2465 Implement proper polyfill for localStorage
class LocalStoragePolyfill {
  private storage: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.storage.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.storage.set(key, String(value));
  }

  removeItem(key: string): void {
    this.storage.delete(key);
  }

  clear(): void {
    this.storage.clear();
  }

  get length(): number {
    return this.storage.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.storage.keys());
    return keys[index] ?? null;
  }
}

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
    (global as unknown as { crypto: { getRandomValues: (array: Uint8Array) => void } }).crypto.getRandomValues = function (array: Uint8Array) {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    };
  
  registerGlobals();
  // Custom overrides
  (globalThis.RTCPeerConnection as unknown as typeof RTCPeerConnection) = RTCPeerConnection;
};

registerGlobalsPolyfill()

/**
 * WebRTC Polyfill for React Native
 *
 * This file bridges react-native-webrtc with the browser WebRTC APIs
 * expected by @fishjam-cloud/ts-client and @fishjam-cloud/webrtc-client
 */

import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
  MediaStreamTrack,
  mediaDevices,
  registerGlobals,
} from "react-native-webrtc";

// Import EventTarget polyfill from event-target-shim
import { EventTarget } from "event-target-shim";

if (typeof global !== "undefined") {
  if (!(global as any).crypto) {
    (global as any).crypto = {};
  }
  if (!(global as any).crypto.getRandomValues) {
    (global as any).crypto.getRandomValues = function (array: any) {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    };
  }
}

// Simple localStorage polyfill using an in-memory store
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

// Register react-native-webrtc globals
registerGlobals();

// Explicitly set global WebRTC APIs for TypeScript/module compatibility
if (typeof global !== "undefined") {
  // Add EventTarget polyfill
  if (!(global as any).EventTarget) {
    (global as any).EventTarget = EventTarget;
  }

  // Add localStorage polyfill
  if (!(global as any).localStorage) {
    (global as any).localStorage = new LocalStoragePolyfill();
  }

  // Add sessionStorage polyfill (same as localStorage for now)
  if (!(global as any).sessionStorage) {
    (global as any).sessionStorage = new LocalStoragePolyfill();
  }

  (global as any).RTCPeerConnection = RTCPeerConnection;
  (global as any).RTCIceCandidate = RTCIceCandidate;
  (global as any).RTCSessionDescription = RTCSessionDescription;
  (global as any).MediaStream = MediaStream;
  (global as any).MediaStreamTrack = MediaStreamTrack;

  // Add navigator.mediaDevices if not present
  if (!(global as any).navigator) {
    (global as any).navigator = {};
  }
  if (!(global as any).navigator.mediaDevices) {
    (global as any).navigator.mediaDevices = mediaDevices;
  }
}

export {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
  MediaStreamTrack,
  mediaDevices,
};

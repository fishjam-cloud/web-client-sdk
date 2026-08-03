import { classifyDeviceError } from "./errors";
const inputDeviceKinds = {
  audioinput: "audio",
  videoinput: "video",
};
export class WebDeviceManager {
  persistence;
  constructor({ persistence } = {}) {
    this.persistence = persistence;
  }
  async enumerateDevices() {
    const devices = await this.getMediaDevices().enumerateDevices();
    return devices.flatMap((device) => {
      const kind = inputDeviceKinds[device.kind];
      if (!kind) return [];
      return [{ deviceId: device.deviceId, label: device.label, kind }];
    });
  }
  async getUserMedia(constraints) {
    const mediaDevices = this.getMediaDevices();
    try {
      return await mediaDevices.getUserMedia(constraints);
    } catch (error) {
      throw classifyDeviceError(error);
    }
  }
  async getDisplayMedia(options) {
    const mediaDevices = this.getMediaDevices();
    try {
      return await mediaDevices.getDisplayMedia(options);
    } catch (error) {
      throw classifyDeviceError(error);
    }
  }
  onDeviceChange(callback) {
    const mediaDevices = this.getMediaDevices();
    // React Native's polyfilled navigator.mediaDevices has no devicechange
    // events; device-list refreshes then only happen on explicit operations.
    if (typeof mediaDevices.addEventListener !== "function") return () => {};
    const listener = () => callback();
    let subscribed = true;
    mediaDevices.addEventListener("devicechange", listener);
    return () => {
      if (!subscribed) return;
      subscribed = false;
      mediaDevices.removeEventListener("devicechange", listener);
    };
  }
  getMediaDevices() {
    const mediaDevices = globalThis.navigator?.mediaDevices;
    if (!mediaDevices) throw new Error("MediaDevices API is not available in this environment");
    return mediaDevices;
  }
}

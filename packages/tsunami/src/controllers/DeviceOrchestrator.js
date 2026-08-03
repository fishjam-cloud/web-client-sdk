import { prepareConstraints } from "../devices/constraints";
import { correctDevicesOnSafari, getAvailableMedia } from "../devices/mediaInitializer";
import { CustomSourceController } from "./CustomSourceController";
import { ScreenShareController } from "./ScreenShareController";
import { TrackDeviceController } from "./TrackDeviceController";
/**
 * Created only when an `IDeviceManager` is injected. Owns device
 * initialization, hardware enumeration, and the per-source controllers, and
 * mirrors all of it into the client state store.
 */
export class DeviceOrchestrator {
  deps;
  camera;
  microphone;
  screenShare;
  customSources;
  deviceList = [];
  availableCameras = [];
  availableMicrophones = [];
  isInitialized = false;
  initializationPromise = null;
  deviceChangeCleanup;
  constructor(deps) {
    this.deps = deps;
    const commonControllerDeps = {
      publisher: deps.publisher,
      deviceManager: deps.deviceManager,
      logger: deps.logger,
      getPeerStatus: () => deps.store.getState().peerStatus,
      getInitialStream: () => this.getInitialStream(),
      invalidateInitialStream: () => {
        this.initializationPromise = null;
      },
      onStateChanged: () => this.syncStore(),
    };
    this.camera = new TrackDeviceController({
      ...commonControllerDeps,
      type: "video",
      constraints: deps.videoConstraints,
      bandwidthLimits: deps.bandwidthLimits,
      streamConfig: deps.videoStreamConfig,
      getAvailableDevices: () => this.availableCameras,
      onSelectedDeviceChanged: (device) => this.persistLastDevice("video", device),
    });
    this.microphone = new TrackDeviceController({
      ...commonControllerDeps,
      type: "audio",
      constraints: deps.audioConstraints,
      bandwidthLimits: deps.bandwidthLimits,
      streamConfig: deps.audioStreamConfig,
      getAvailableDevices: () => this.availableMicrophones,
      onSelectedDeviceChanged: (device) => this.persistLastDevice("audio", device),
    });
    this.screenShare = new ScreenShareController(commonControllerDeps);
    this.customSources = new CustomSourceController(commonControllerDeps);
    this.deviceChangeCleanup = deps.deviceManager.onDeviceChange(() => {
      void this.refreshDeviceList().catch((error) => deps.logger.error("Failed to refresh device list", error));
    });
    this.syncStore();
  }
  async initializeDevices(settings) {
    if (this.isInitialized) {
      return { stream: null, errors: null, status: "already_initialized" };
    }
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    const persistence = this.deps.deviceManager.persistence;
    const lastUsed = {
      audio: (await persistence?.getLastDevice("audio")) ?? null,
      video: (await persistence?.getLastDevice("video")) ?? null,
    };
    const constraints = {
      video:
        settings?.enableVideo !== false && prepareConstraints(lastUsed.video?.deviceId, this.deps.videoConstraints),
      audio:
        settings?.enableAudio !== false && prepareConstraints(lastUsed.audio?.deviceId, this.deps.audioConstraints),
    };
    const initialize = async () => {
      let media = await getAvailableMedia(this.deps.deviceManager, constraints);
      await this.refreshDeviceList();
      if (media.stream) {
        media = await correctDevicesOnSafari(
          this.deps.deviceManager,
          media.stream,
          media.errors,
          this.deviceList,
          constraints,
          lastUsed,
        );
      }
      const { stream, errors } = media;
      const videoDeviceId = stream?.getVideoTracks()[0]?.getSettings().deviceId;
      const audioDeviceId = stream?.getAudioTracks()[0]?.getSettings().deviceId;
      const videoDevice = this.availableCameras.find((device) => device.deviceId === videoDeviceId);
      const audioDevice = this.availableMicrophones.find((device) => device.deviceId === audioDeviceId);
      if (videoDevice) this.camera.setSelectedDevice(videoDevice);
      if (audioDevice) this.microphone.setSelectedDevice(audioDevice);
      // Both controllers adopt the same stream; each only ever touches tracks
      // of its own kind.
      this.camera.adoptInitialStream(stream);
      this.microphone.adoptInitialStream(stream);
      this.camera.setError(errors.video);
      this.microphone.setError(errors.audio);
      if (!stream) {
        return { status: "failed", errors, stream: null };
      } else if (errors.video || errors.audio) {
        return { status: "initialized_with_errors", errors, stream: null };
      } else {
        return { status: "initialized", errors: null, stream };
      }
    };
    const initializationPromise = initialize().then(
      (result) => {
        this.isInitialized = true;
        this.syncStore();
        return result;
      },
      (error) => {
        this.initializationPromise = null;
        throw error;
      },
    );
    this.initializationPromise = initializationPromise;
    return initializationPromise;
  }
  dispose() {
    this.deviceChangeCleanup();
    this.camera.dispose();
    this.microphone.dispose();
    this.screenShare.dispose();
    this.customSources.dispose();
  }
  async getInitialStream() {
    const result = await this.initializationPromise;
    return result?.stream ?? null;
  }
  async refreshDeviceList() {
    this.deviceList = await this.deps.deviceManager.enumerateDevices();
    this.availableCameras = this.deviceList.filter((device) => device.kind === "video");
    this.availableMicrophones = this.deviceList.filter((device) => device.kind === "audio");
    this.syncStore();
  }
  persistLastDevice(type, device) {
    void Promise.resolve(this.deps.deviceManager.persistence?.saveLastDevice(type, device)).catch((error) =>
      this.deps.logger.warn({ name: "Failed to persist last device", error }),
    );
  }
  syncStore() {
    this.deps.store.update({
      camera: this.camera.snapshot(),
      microphone: this.microphone.snapshot(),
      screenShare: this.screenShare.snapshot(),
      customSources: this.customSources.snapshot(),
      availableCameras: this.availableCameras,
      availableMicrophones: this.availableMicrophones,
      cameraError: this.camera.error,
      microphoneError: this.microphone.error,
      devicesInitialized: this.isInitialized,
    });
  }
}

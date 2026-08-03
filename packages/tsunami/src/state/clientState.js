const createInitialDeviceState = () => ({
  track: null,
  stream: null,
  isEnabled: true,
  activeDevice: null,
  selectedDevice: null,
  middleware: null,
});
export const createInitialClientState = () => ({
  peerStatus: "idle",
  reconnectionStatus: "idle",
  localPeer: null,
  remotePeers: {},
  components: {},
  camera: createInitialDeviceState(),
  microphone: createInitialDeviceState(),
  screenShare: { stream: null, videoTrack: null, audioTrack: null, middleware: null },
  customSources: {},
  availableCameras: [],
  availableMicrophones: [],
  cameraError: null,
  microphoneError: null,
  devicesInitialized: false,
});

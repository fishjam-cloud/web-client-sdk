import {
  type ClientState,
  type DeviceItem,
  FishjamClient,
  LocalStorageDevicePersistence,
  WebDeviceManager,
} from "@fishjam-cloud/tsunami";

const client = new FishjamClient({
  deviceManager: new WebDeviceManager({ persistence: new LocalStorageDevicePersistence() }),
});

const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
};

const cameraPreview = element<HTMLVideoElement>("camera-preview");
const screensharePreview = element<HTMLVideoElement>("screenshare-preview");
const cameraSelect = element<HTMLSelectElement>("camera-select");
const microphoneSelect = element<HTMLSelectElement>("mic-select");
const eventLog = element<HTMLPreElement>("event-log");

const logLines: string[] = [];
const log = (message: string) => {
  const timestamp = new Date().toLocaleTimeString();
  logLines.unshift(`${timestamp}  ${message}`);
  eventLog.textContent = logLines.slice(0, 12).join("\n");
};

const run = (label: string, operation: () => Promise<unknown>) => {
  operation().then(
    () => log(`${label} ✓`),
    (error) => log(`${label} ✗ ${error instanceof Error ? error.message : String(error)}`),
  );
};

element("init-devices").onclick = () => run("initializeDevices", () => client.initializeDevices());
element("toggle-camera").onclick = () => run("toggleCamera", () => client.toggleCamera());
element("toggle-mic").onclick = () => run("toggleMicrophone", () => client.toggleMicrophone());
element("mute-mic").onclick = () => run("toggleMicrophoneMute", () => client.toggleMicrophoneMute());
element("start-screenshare").onclick = () => run("startScreenShare", () => client.startScreenShare());
element("stop-screenshare").onclick = () => run("stopScreenShare", () => client.stopScreenShare());

cameraSelect.onchange = () => run(`selectCamera(${cameraSelect.value.slice(0, 8)}…)`, () => client.selectCamera(cameraSelect.value));
microphoneSelect.onchange = () =>
  run(`selectMicrophone(${microphoneSelect.value.slice(0, 8)}…)`, () => client.selectMicrophone(microphoneSelect.value));

element("connect").onclick = () => {
  const url = element<HTMLInputElement>("connect-url").value.trim();
  const token = element<HTMLInputElement>("connect-token").value.trim();
  if (!url || !token) {
    log("connect ✗ paste a Fishjam URL and peer token first");
    return;
  }
  run("connect", () => client.connect({ url, token, peerMetadata: { displayName: "tsunami-vanilla" } }));
};
element("disconnect").onclick = () => {
  client.disconnect();
  log("disconnect ✓");
};

const deviceLabel = (device: DeviceItem | null) => device?.label || device?.deviceId.slice(0, 12) || "—";

const renderDeviceOptions = (select: HTMLSelectElement, devices: DeviceItem[], active: DeviceItem | null) => {
  select.replaceChildren(
    ...devices.map((device) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || device.deviceId;
      option.selected = device.deviceId === active?.deviceId;
      return option;
    }),
  );
};

type State = ClientState;

let notificationCount = 0;
let previousState: State | null = null;

const sliceNames = [
  "peerStatus",
  "reconnectionStatus",
  "localPeer",
  "remotePeers",
  "components",
  "camera",
  "microphone",
  "screenShare",
  "customSources",
  "availableCameras",
  "availableMicrophones",
  "cameraError",
  "microphoneError",
  "devicesInitialized",
] as const;

const changedSlices = (previous: State | null, next: State): string[] =>
  previous ? sliceNames.filter((name) => previous[name] !== next[name]) : [...sliceNames];

const render = () => {
  const state = client.getState();

  element("stat-peer-status").textContent = state.peerStatus;
  element("stat-devices-initialized").textContent = String(state.devicesInitialized);

  const cameraPill = state.camera.track ? (state.camera.isEnabled ? "on" : "muted") : "off";
  element("stat-camera").innerHTML =
    `<span class="pill ${state.camera.track ? "on" : "off"}">${cameraPill}</span> ${deviceLabel(state.camera.activeDevice ?? state.camera.selectedDevice)}`;

  const microphonePill = state.microphone.track ? (state.microphone.isEnabled ? "on" : "muted") : "off";
  element("stat-microphone").innerHTML =
    `<span class="pill ${state.microphone.track && state.microphone.isEnabled ? "on" : "off"}">${microphonePill}</span> ${deviceLabel(state.microphone.activeDevice ?? state.microphone.selectedDevice)}`;

  element("stat-screenshare").innerHTML =
    `<span class="pill ${state.screenShare.stream ? "on" : "off"}">${state.screenShare.stream ? "sharing" : "off"}</span>`;

  element("stat-available-cameras").textContent = String(state.availableCameras.length);
  element("stat-available-microphones").textContent = String(state.availableMicrophones.length);
  element("stat-remote-peers").textContent = String(Object.keys(state.remotePeers).length);

  const errors = [state.cameraError && `camera: ${state.cameraError.name}`, state.microphoneError && `mic: ${state.microphoneError.name}`]
    .filter(Boolean)
    .join(", ");
  element("stat-errors").innerHTML = errors ? `<span class="pill err">${errors}</span>` : "none";

  renderDeviceOptions(cameraSelect, state.availableCameras, state.camera.activeDevice ?? state.camera.selectedDevice);
  renderDeviceOptions(
    microphoneSelect,
    state.availableMicrophones,
    state.microphone.activeDevice ?? state.microphone.selectedDevice,
  );

  // This demo runs on the web, so the platform-contract types narrow back to
  // their DOM implementations.
  const cameraTrack = (state.camera.track as MediaStreamTrack | null) ?? null;
  const cameraStream = cameraTrack ? new MediaStream([cameraTrack]) : null;
  const currentCameraTrack = (cameraPreview.srcObject as MediaStream | null)?.getVideoTracks()[0] ?? null;
  if (currentCameraTrack !== cameraTrack) {
    cameraPreview.srcObject = cameraStream;
  }

  const screenShareStream = (state.screenShare.stream as MediaStream | null) ?? null;
  if (screensharePreview.srcObject !== screenShareStream) {
    screensharePreview.srcObject = screenShareStream;
  }

  renderRemoteTracks();

  element("stat-render-count").textContent = String(notificationCount);
  element("changed-slices").textContent = changedSlices(previousState, state).join(", ") || "(no slice changed)";
  previousState = state;
};

const remoteGrid = element<HTMLDivElement>("remote-grid");
const remoteVideos = new Map<string, HTMLVideoElement>();

const renderRemoteTracks = () => {
  const remoteTracks = Object.values(client.getRemoteTracks()).filter(
    (context) => context.track?.kind === "video" && context.stream,
  );

  for (const [trackId, video] of remoteVideos) {
    if (!remoteTracks.some((context) => context.trackId === trackId)) {
      video.remove();
      remoteVideos.delete(trackId);
    }
  }

  for (const context of remoteTracks) {
    let video = remoteVideos.get(context.trackId);
    if (!video) {
      video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      remoteGrid.append(video);
      remoteVideos.set(context.trackId, video);
    }
    if (video.srcObject !== context.stream) video.srcObject = context.stream;
  }

  element("stat-remote-tracks").textContent = String(remoteTracks.length);
};

client.subscribe(() => {
  notificationCount += 1;
  render();
});

render();
log("client created — state is live before any connection");

import { __decorate } from "tslib";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { FishjamService } from "./fishjam.service";
const MAX_ACTIVITY_LOG_LINES = 10;
let AppComponent = class AppComponent {
    fishjam = inject(FishjamService);
    state = this.fishjam.state;
    activityLog = signal([]);
    activityLogText = computed(() => this.activityLog().join("\n"));
    errorSummary = computed(() => {
        const { cameraError, microphoneError } = this.state();
        const parts = [
            cameraError && `camera: ${cameraError.name}`,
            microphoneError && `microphone: ${microphoneError.name}`,
        ]
            .filter(Boolean)
            .join(", ");
        return parts || "none";
    });
    activeCameraId = computed(() => {
        const { activeDevice, selectedDevice } = this.state().camera;
        return activeDevice?.deviceId ?? selectedDevice?.deviceId;
    });
    activeMicrophoneId = computed(() => {
        const { activeDevice, selectedDevice } = this.state().microphone;
        return activeDevice?.deviceId ?? selectedDevice?.deviceId;
    });
    // The state exposes platform-contract track types; this app runs on the web,
    // so they narrow back to their DOM implementations for rendering.
    cameraTrack = computed(() => this.state().camera.track);
    cameraPreviewStream = computed(() => {
        const track = this.cameraTrack();
        return track ? new MediaStream([track]) : null;
    });
    screenSharePreviewStream = computed(() => this.state().screenShare.stream ?? null);
    remoteVideoTracks = computed(() => {
        this.state(); // remote tracks are read from the client, so re-read them on every state change
        return Object.values(this.fishjam.client.getRemoteTracks()).filter((context) => context.track?.kind === "video" && context.stream);
    });
    connect(url, token) {
        if (!url.trim() || !token.trim()) {
            this.log("connect ✗ paste a Fishjam URL and peer token first");
            return;
        }
        this.run("connect", () => this.fishjam.client.connect({
            url: url.trim(),
            token: token.trim(),
            peerMetadata: { displayName: "tsunami-angular" },
        }));
    }
    disconnect() {
        this.fishjam.client.disconnect();
        this.log("disconnect ✓");
    }
    initializeDevices() {
        this.run("initializeDevices", () => this.fishjam.client.initializeDevices());
    }
    toggleCamera() {
        this.run("toggleCamera", () => this.fishjam.client.toggleCamera());
    }
    toggleMicrophone() {
        this.run("toggleMicrophone", () => this.fishjam.client.toggleMicrophone());
    }
    toggleMicrophoneMute() {
        this.run("toggleMicrophoneMute", () => this.fishjam.client.toggleMicrophoneMute());
    }
    startScreenShare() {
        this.run("startScreenShare", () => this.fishjam.client.startScreenShare());
    }
    stopScreenShare() {
        this.run("stopScreenShare", () => this.fishjam.client.stopScreenShare());
    }
    selectCamera(event) {
        const deviceId = event.target.value;
        this.run("selectCamera", () => this.fishjam.client.selectCamera(deviceId));
    }
    selectMicrophone(event) {
        const deviceId = event.target.value;
        this.run("selectMicrophone", () => this.fishjam.client.selectMicrophone(deviceId));
    }
    run(label, operation) {
        operation().then(() => this.log(`${label} ✓`), (error) => this.log(`${label} ✗ ${error instanceof Error ? error.message : String(error)}`));
    }
    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        this.activityLog.update((lines) => [`${timestamp}  ${message}`, ...lines].slice(0, MAX_ACTIVITY_LOG_LINES));
    }
};
AppComponent = __decorate([
    Component({
        selector: "app-root",
        changeDetection: ChangeDetectionStrategy.OnPush,
        template: `
    <main>
      <h1>Fishjam Tsunami — Angular</h1>

      <p class="status-line">
        peer: <strong>{{ state().peerStatus }}</strong> · reconnection:
        <strong>{{ state().reconnectionStatus }}</strong> · devices initialized:
        <strong>{{ state().devicesInitialized }}</strong> · errors: <strong>{{ errorSummary() }}</strong>
      </p>

      <section>
        <h2>Connection</h2>
        <input #urlInput placeholder="wss://… Fishjam URL" size="32" />
        <input #tokenInput placeholder="peer token" size="32" />
        <button (click)="connect(urlInput.value, tokenInput.value)">Join</button>
        <button (click)="disconnect()">Leave</button>
      </section>

      <section>
        <h2>Devices</h2>
        <button (click)="initializeDevices()">Initialize devices</button>
        <button (click)="toggleCamera()">Toggle camera</button>
        <button (click)="toggleMicrophone()">Toggle microphone</button>
        <button (click)="toggleMicrophoneMute()">
          {{ state().microphone.isEnabled ? "Mute" : "Unmute" }} microphone
        </button>
        <label>
          Camera
          <select (change)="selectCamera($event)">
            @for (device of state().availableCameras; track device.deviceId) {
              <option [value]="device.deviceId" [selected]="device.deviceId === activeCameraId()">
                {{ device.label || device.deviceId }}
              </option>
            }
          </select>
        </label>
        <label>
          Microphone
          <select (change)="selectMicrophone($event)">
            @for (device of state().availableMicrophones; track device.deviceId) {
              <option [value]="device.deviceId" [selected]="device.deviceId === activeMicrophoneId()">
                {{ device.label || device.deviceId }}
              </option>
            }
          </select>
        </label>
      </section>

      <section>
        <h2>Local previews</h2>
        <div class="preview-row">
          <figure>
            <video autoplay playsinline [muted]="true" [srcObject]="cameraPreviewStream()"></video>
            <figcaption>camera{{ state().camera.isEnabled ? "" : " (muted)" }}</figcaption>
          </figure>
          <figure>
            <video autoplay playsinline [muted]="true" [srcObject]="screenSharePreviewStream()"></video>
            <figcaption>
              screen share
              <button (click)="startScreenShare()">Start</button>
              <button (click)="stopScreenShare()">Stop</button>
            </figcaption>
          </figure>
        </div>
      </section>

      <section>
        <h2>Remote tracks ({{ remoteVideoTracks().length }})</h2>
        <div class="remote-grid">
          @for (context of remoteVideoTracks(); track context.trackId) {
            <video autoplay playsinline [srcObject]="context.stream"></video>
          }
        </div>
      </section>

      <section>
        <h2>Activity</h2>
        <pre>{{ activityLogText() }}</pre>
      </section>
    </main>
  `,
    })
], AppComponent);
export { AppComponent };

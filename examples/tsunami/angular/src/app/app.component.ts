import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import type { FishjamTrackContext } from "@fishjam-cloud/tsunami";

import { FishjamService } from "./fishjam.service";

const MAX_ACTIVITY_LOG_LINES = 10;

@Component({
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
export class AppComponent {
  protected readonly fishjam = inject(FishjamService);
  protected readonly state = this.fishjam.state;

  protected readonly activityLog = signal<string[]>([]);
  protected readonly activityLogText = computed(() => this.activityLog().join("\n"));

  protected readonly errorSummary = computed(() => {
    const { cameraError, microphoneError } = this.state();
    const parts = [
      cameraError && `camera: ${cameraError.name}`,
      microphoneError && `microphone: ${microphoneError.name}`,
    ]
      .filter(Boolean)
      .join(", ");
    return parts || "none";
  });

  protected readonly activeCameraId = computed(() => {
    const { activeDevice, selectedDevice } = this.state().camera;
    return activeDevice?.deviceId ?? selectedDevice?.deviceId;
  });

  protected readonly activeMicrophoneId = computed(() => {
    const { activeDevice, selectedDevice } = this.state().microphone;
    return activeDevice?.deviceId ?? selectedDevice?.deviceId;
  });

  // The state exposes platform-contract track types; this app runs on the web,
  // so they narrow back to their DOM implementations for rendering.
  private readonly cameraTrack = computed(() => this.state().camera.track as MediaStreamTrack | null);

  protected readonly cameraPreviewStream = computed<MediaStream | null>(() => {
    const track = this.cameraTrack();
    return track ? new MediaStream([track]) : null;
  });

  protected readonly screenSharePreviewStream = computed<MediaStream | null>(
    () => (this.state().screenShare.stream as MediaStream | null) ?? null,
  );

  protected readonly remoteVideoTracks = computed<FishjamTrackContext[]>(() => {
    this.state(); // remote tracks are read from the client, so re-read them on every state change
    return Object.values(this.fishjam.client.getRemoteTracks()).filter(
      (context) => context.track?.kind === "video" && context.stream,
    );
  });

  protected connect(url: string, token: string): void {
    if (!url.trim() || !token.trim()) {
      this.log("connect ✗ paste a Fishjam URL and peer token first");
      return;
    }
    this.run("connect", () =>
      this.fishjam.client.connect({
        url: url.trim(),
        token: token.trim(),
        peerMetadata: { displayName: "tsunami-angular" },
      }),
    );
  }

  protected disconnect(): void {
    this.fishjam.client.disconnect();
    this.log("disconnect ✓");
  }

  protected initializeDevices(): void {
    this.run("initializeDevices", () => this.fishjam.client.initializeDevices());
  }

  protected toggleCamera(): void {
    this.run("toggleCamera", () => this.fishjam.client.toggleCamera());
  }

  protected toggleMicrophone(): void {
    this.run("toggleMicrophone", () => this.fishjam.client.toggleMicrophone());
  }

  protected toggleMicrophoneMute(): void {
    this.run("toggleMicrophoneMute", () => this.fishjam.client.toggleMicrophoneMute());
  }

  protected startScreenShare(): void {
    this.run("startScreenShare", () => this.fishjam.client.startScreenShare());
  }

  protected stopScreenShare(): void {
    this.run("stopScreenShare", () => this.fishjam.client.stopScreenShare());
  }

  protected selectCamera(event: Event): void {
    const deviceId = (event.target as HTMLSelectElement).value;
    this.run("selectCamera", () => this.fishjam.client.selectCamera(deviceId));
  }

  protected selectMicrophone(event: Event): void {
    const deviceId = (event.target as HTMLSelectElement).value;
    this.run("selectMicrophone", () => this.fishjam.client.selectMicrophone(deviceId));
  }

  private run(label: string, operation: () => Promise<unknown>): void {
    operation().then(
      () => this.log(`${label} ✓`),
      (error: unknown) => this.log(`${label} ✗ ${error instanceof Error ? error.message : String(error)}`),
    );
  }

  private log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.activityLog.update((lines) => [`${timestamp}  ${message}`, ...lines].slice(0, MAX_ACTIVITY_LOG_LINES));
  }
}

import { DeviceOverconstrainedError, DevicePermissionDeniedError } from "@fishjam-cloud/tsunami";
import { createFakeStream } from "./support/fakeMediaStream";
import { describe, expect, it } from "./support/fixtures";
const fullStream = () => createFakeStream([
    { kind: "video", deviceId: "camera-1" },
    { kind: "audio", deviceId: "microphone-1" },
]);
const installedDevices = [
    { deviceId: "camera-1", kind: "videoinput", label: "Camera 1" },
    { deviceId: "microphone-1", kind: "audioinput", label: "Microphone 1" },
];
describe("initializeDevices", () => {
    it("acquires media and mirrors devices into state", async ({ media, service }) => {
        media.setUserMediaStream(fullStream());
        media.setEnumeratedDevices(installedDevices);
        const result = await service.client.initializeDevices();
        expect(result.status).toBe("initialized");
        expect(result.stream).not.toBeNull();
        expect(media.devices.getUserMedia).toHaveBeenCalledTimes(1);
        const state = service.state();
        expect(state.devicesInitialized).toBe(true);
        expect(state.availableCameras).toMatchObject([{ deviceId: "camera-1", label: "Camera 1" }]);
        expect(state.availableMicrophones).toMatchObject([{ deviceId: "microphone-1", label: "Microphone 1" }]);
        expect(state.camera.track).not.toBeNull();
        expect(state.microphone.track).not.toBeNull();
        expect(state.cameraError).toBeNull();
        expect(state.microphoneError).toBeNull();
    });
    it("deduplicates: a second call reports already_initialized without touching the platform again", async ({ media, service, }) => {
        media.setUserMediaStream(fullStream());
        media.setEnumeratedDevices(installedDevices);
        await service.client.initializeDevices();
        const secondResult = await service.client.initializeDevices();
        expect(secondResult.status).toBe("already_initialized");
        expect(media.devices.getUserMedia).toHaveBeenCalledTimes(1);
        expect(service.state().devicesInitialized).toBe(true);
    });
    it("surfaces OverconstrainedError in cameraError when selecting a nonexistent camera", async ({ media, service }) => {
        media.setUserMediaStream(fullStream());
        media.setEnumeratedDevices(installedDevices);
        await service.client.initializeDevices();
        await service.client.selectCamera("nonexistent-camera");
        const { cameraError } = service.state();
        expect(cameraError).toBeInstanceOf(DeviceOverconstrainedError);
        expect(cameraError?.name).toBe("OverconstrainedError");
    });
    it("surfaces NotAllowedError in both device error slots when permission is denied", async ({ media, service }) => {
        media.failUserMediaAlways("NotAllowedError");
        const result = await service.client.initializeDevices();
        expect(result.status).toBe("failed");
        expect(service.state().cameraError).toBeInstanceOf(DevicePermissionDeniedError);
        expect(service.state().cameraError?.name).toBe("NotAllowedError");
        expect(service.state().microphoneError?.name).toBe("NotAllowedError");
    });
});

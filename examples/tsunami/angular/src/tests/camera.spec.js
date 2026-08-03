import { createFakeStream } from "./support/fakeMediaStream";
import { connectAndJoin, describe, expect, it } from "./support/fixtures";
const videoStream = () => createFakeStream([{ kind: "video", deviceId: "camera-1" }]);
describe("camera", () => {
    it("is off before the device is started", ({ service }) => {
        expect(service.state().camera.track).toBeNull();
        expect(service.state().camera.stream).toBeNull();
    });
    it("startCamera exposes the track in state without publishing when not connected", async ({ media, service, signalling, }) => {
        media.setUserMediaStream(videoStream());
        await service.client.startCamera();
        expect(media.devices.getUserMedia).toHaveBeenCalledTimes(1);
        expect(service.state().camera.track).not.toBeNull();
        expect(service.state().camera.stream).not.toBeNull();
        expect(signalling.addTrack).not.toHaveBeenCalled();
    });
    it("stopCamera tears the track down in state", async ({ media, service }) => {
        media.setUserMediaStream(videoStream());
        await service.client.startCamera();
        await service.client.stopCamera();
        expect(service.state().camera.track).toBeNull();
        expect(service.state().camera.stream).toBeNull();
    });
    it("toggleCamera while connected publishes one video track with camera metadata", async ({ media, service, signalling, }) => {
        media.setUserMediaStream(videoStream());
        await connectAndJoin(service, signalling);
        await service.client.toggleCamera();
        expect(service.state().camera.track).not.toBeNull();
        expect(signalling.addTrack).toHaveBeenCalledTimes(1);
        const [publishedTrack, publishedMetadata] = signalling.addTrack.mock.calls[0];
        expect(publishedTrack.kind).toBe("video");
        expect(publishedMetadata).toMatchObject({ type: "camera", paused: false });
    });
    it("toggleCamera off pauses the published track and does not remove it", async ({ media, service, signalling }) => {
        media.setUserMediaStream(videoStream());
        await connectAndJoin(service, signalling);
        await service.client.toggleCamera(); // on + publish
        const publishedTrackId = await signalling.addTrack.mock.results[0].value;
        await service.client.toggleCamera(); // off
        expect(service.state().camera.track).toBeNull();
        expect(signalling.removeTrack).not.toHaveBeenCalled();
        expect(signalling.replaceTrack).toHaveBeenCalledWith(publishedTrackId, null);
        expect(signalling.updateTrackMetadata).toHaveBeenCalledWith(publishedTrackId, expect.objectContaining({ type: "camera", paused: true }));
    });
    it("auto-publishes an already running camera when the room is joined", async ({ media, service, signalling }) => {
        media.setUserMediaStream(videoStream());
        await service.client.startCamera();
        expect(signalling.addTrack).not.toHaveBeenCalled();
        await connectAndJoin(service, signalling);
        expect(signalling.addTrack).toHaveBeenCalledTimes(1);
        expect(signalling.addTrack.mock.calls[0][1]).toMatchObject({ type: "camera" });
    });
});

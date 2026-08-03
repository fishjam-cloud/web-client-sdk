import { createFakeStream, createFakeTrack } from "./support/fakeMediaStream";
import { connectAndJoin, describe, expect, it } from "./support/fixtures";
const displayStream = () => createFakeStream([
    { kind: "video", deviceId: "screen-1" },
    { kind: "audio", deviceId: "tab-audio-1" },
]);
describe("screen share", () => {
    it("has no stream initially", ({ service }) => {
        const { stream, videoTrack, audioTrack } = service.state().screenShare;
        expect(stream).toBeNull();
        expect(videoTrack).toBeNull();
        expect(audioTrack).toBeNull();
    });
    it("startScreenShare while connected publishes screen share video and audio tracks", async ({ media, service, signalling, }) => {
        media.setDisplayMediaStream(displayStream());
        await connectAndJoin(service, signalling);
        await service.client.startScreenShare();
        expect(media.devices.getDisplayMedia).toHaveBeenCalledTimes(1);
        const screenShareState = service.state().screenShare;
        expect(screenShareState.stream).not.toBeNull();
        expect(screenShareState.videoTrack).not.toBeNull();
        expect(screenShareState.audioTrack).not.toBeNull();
        const publishedTypes = signalling.addTrack.mock.calls.map((call) => call[1].type);
        expect(publishedTypes).toContain("screenShareVideo");
        expect(publishedTypes).toContain("screenShareAudio");
    });
    it("keeps the capture local when not connected", async ({ media, service, signalling }) => {
        media.setDisplayMediaStream(displayStream());
        await service.client.startScreenShare();
        expect(service.state().screenShare.stream).not.toBeNull();
        expect(signalling.addTrack).not.toHaveBeenCalled();
    });
    it("stopScreenShare removes the published tracks and clears the state", async ({ media, service, signalling }) => {
        media.setDisplayMediaStream(displayStream());
        await connectAndJoin(service, signalling);
        await service.client.startScreenShare();
        await service.client.stopScreenShare();
        expect(signalling.removeTrack).toHaveBeenCalledTimes(2);
        const screenShareState = service.state().screenShare;
        expect(screenShareState.stream).toBeNull();
        expect(screenShareState.videoTrack).toBeNull();
        expect(screenShareState.audioTrack).toBeNull();
    });
    it("setScreenShareTracksMiddleware persists in state and replaces the published tracks", async ({ media, service, signalling, }) => {
        media.setDisplayMediaStream(displayStream());
        await connectAndJoin(service, signalling);
        await service.client.startScreenShare();
        const processedVideoTrack = createFakeTrack({ kind: "video", deviceId: "processed-video" });
        const middleware = (videoTrack, audioTrack) => ({
            videoTrack: processedVideoTrack,
            audioTrack,
            onClear: () => { },
        });
        await service.client.setScreenShareTracksMiddleware(middleware);
        expect(service.state().screenShare.middleware).toBe(middleware);
        expect(signalling.replaceTrack).toHaveBeenCalled();
        // The middleware survives stopping the capture, ready for the next start.
        await service.client.stopScreenShare();
        expect(service.state().screenShare.middleware).toBe(middleware);
    });
});

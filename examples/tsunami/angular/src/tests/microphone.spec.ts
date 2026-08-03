import { createFakeStream } from "./support/fakeMediaStream";
import { connectAndJoin, describe, expect, it } from "./support/fixtures";

const audioStream = () => createFakeStream([{ kind: "audio", deviceId: "microphone-1" }]);

describe("microphone", () => {
  it("starts off and unmuted", ({ service }) => {
    expect(service.state().microphone.track).toBeNull();
    expect(service.state().microphone.isEnabled).toBe(true);
  });

  it("toggleMicrophone while connected publishes one audio track with microphone metadata", async ({
    media,
    service,
    signalling,
  }) => {
    media.setUserMediaStream(audioStream());
    await connectAndJoin(service, signalling);

    await service.client.toggleMicrophone();

    expect(service.state().microphone.track).not.toBeNull();
    expect(signalling.addTrack).toHaveBeenCalledTimes(1);
    const [publishedTrack, publishedMetadata] = signalling.addTrack.mock.calls[0];
    expect(publishedTrack.kind).toBe("audio");
    expect(publishedMetadata).toMatchObject({ type: "microphone", paused: false });
  });

  it("toggleMicrophoneMute flips isEnabled and pauses the published track via replaceTrack(null)", async ({
    media,
    service,
    signalling,
  }) => {
    media.setUserMediaStream(audioStream());
    await connectAndJoin(service, signalling);
    await service.client.toggleMicrophone(); // device on + publish
    const publishedTrackId = await signalling.addTrack.mock.results[0].value;

    await service.client.toggleMicrophoneMute();

    expect(service.state().microphone.isEnabled).toBe(false);
    // Soft mute: the device track stays in state, only media flow stops.
    expect(service.state().microphone.track).not.toBeNull();
    expect(signalling.replaceTrack).toHaveBeenCalledWith(publishedTrackId, null);
    expect(signalling.updateTrackMetadata).toHaveBeenLastCalledWith(
      publishedTrackId,
      expect.objectContaining({ type: "microphone", paused: true }),
    );
    expect(signalling.removeTrack).not.toHaveBeenCalled();
  });

  it("unmuting flips isEnabled back and resumes the published track", async ({ media, service, signalling }) => {
    media.setUserMediaStream(audioStream());
    await connectAndJoin(service, signalling);
    await service.client.toggleMicrophone();
    const publishedTrackId = await signalling.addTrack.mock.results[0].value;

    await service.client.toggleMicrophoneMute(); // mute
    await service.client.toggleMicrophoneMute(); // unmute

    expect(service.state().microphone.isEnabled).toBe(true);
    const lastReplaceCall = signalling.replaceTrack.mock.calls.at(-1);
    expect(lastReplaceCall?.[0]).toBe(publishedTrackId);
    expect(lastReplaceCall?.[1]).not.toBeNull();
    expect(signalling.updateTrackMetadata).toHaveBeenLastCalledWith(
      publishedTrackId,
      expect.objectContaining({ type: "microphone", paused: false }),
    );
  });
});

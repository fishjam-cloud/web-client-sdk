import { WebRTCEndpoint } from "../../src";
import { createCustomVadNotificationEvent, endpointId, trackId } from "../fixtures";
import { setupRoom } from "../utils";
import { expect, it } from "vitest";

it(`Changing VAD notification to "speech" on existing track id`, () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  // When
  const vadNotificationEvent = createCustomVadNotificationEvent(trackId, "speech");
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(vadNotificationEvent));

  // Then
  const track = webRTCEndpoint.getRemoteTracks()[trackId];
  expect(track.vadStatus).toBe(vadNotificationEvent.data.data.status);
});

it(`Changing VAD notification to "silence" on existing track id`, () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  // When
  const vadNotificationEvent = createCustomVadNotificationEvent(trackId, "silence");
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(vadNotificationEvent));

  // Then
  const track = webRTCEndpoint.getRemoteTracks()[trackId];
  expect(track.vadStatus).toBe(vadNotificationEvent.data.data.status);
});

it(`Changing VAD notification emits event`, () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();

    setupRoom(webRTCEndpoint, endpointId, trackId);

    webRTCEndpoint.getRemoteTracks()[trackId].on("voiceActivityChanged", (context) => {
      expect(context.vadStatus).toBe(vadNotificationEvent.data.data.status);
      done("");
    });

    // When
    const vadNotificationEvent = createCustomVadNotificationEvent(trackId, "silence");
    webRTCEndpoint.receiveMediaEvent(JSON.stringify(vadNotificationEvent));
  }));

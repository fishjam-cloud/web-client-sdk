import { WebRTCEndpoint } from "../../src";
import { deserializeMediaEvent } from "../../src/webrtc/mediaEvent";
import { expect, it } from "vitest";

it("Method connect sends mediaEvent to backend", () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();

    const peerMetadata = {};

    webRTCEndpoint.on("sendMediaEvent", (mediaEvent) => {
      // Then
      const event = deserializeMediaEvent(mediaEvent);
      expect(event.type).toBe("connect");
      done("");
    });

    // When
    webRTCEndpoint.connect(peerMetadata);
  }));

it("Method 'connect' sends metadata in event", () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();

    const peerMetadata = { exampleField: "exampleValue" };

    webRTCEndpoint.on("sendMediaEvent", (mediaEvent) => {
      // Then
      const event: any = deserializeMediaEvent(mediaEvent);
      expect(event.data.metadata).toMatchObject(peerMetadata);
      done("");
    });

    // When
    webRTCEndpoint.connect(peerMetadata);
  }));

it("Method 'connect' sets metadata in local field", () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  const peerMetadata = { exampleField: "exampleValue" };

  // When
  webRTCEndpoint.connect(peerMetadata);

  // Then
  expect(webRTCEndpoint["localEndpoint"].metadata).toMatchObject(peerMetadata);
});

it("Method 'connect' throws when metadata is incorrect", () => {
  // Given
  type EndpointMetadata = { validMetadata: true };
  function endpointMetadataParser(data: any): EndpointMetadata {
    if (!data?.validMetadata) throw "Invalid";
    return { validMetadata: true };
  }
  const webRTCEndpoint = new WebRTCEndpoint({ endpointMetadataParser });

  const peerMetadata = { validMetadata: false };

  // Then
  expect(() => webRTCEndpoint.connect(peerMetadata as unknown as EndpointMetadata)).toThrow("Invalid");
});

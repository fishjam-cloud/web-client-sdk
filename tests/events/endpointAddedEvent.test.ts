import { mockRTCPeerConnection } from "../mocks";
import { WebRTCEndpoint } from "../../src";
import {
  createConnectedEvent,
  createConnectedEventWithOneEndpoint,
  createEndpointAdded,
  endpointId,
} from "../fixtures";
import { expect, it } from "vitest";

it("Add endpoint to empty state", () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createConnectedEvent()));

  // When
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createEndpointAdded(endpointId)));

  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  expect(Object.values(endpoints).length).toBe(1);
});

it("Add another endpoint", () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createConnectedEventWithOneEndpoint()));

  // When
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createEndpointAdded(endpointId)));

  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  expect(Object.values(endpoints).length).toBe(2);
});

it("Add endpoint produces event", () =>
  new Promise((done) => {
    // Given
    mockRTCPeerConnection();
    const webRTCEndpoint = new WebRTCEndpoint();

    webRTCEndpoint.receiveMediaEvent(JSON.stringify(createConnectedEventWithOneEndpoint()));

    const addEndpointEvent = createEndpointAdded(endpointId);

    webRTCEndpoint.on("endpointAdded", (endpoint) => {
      // Then
      expect(endpoint.id).toBe(addEndpointEvent.data.id);
      expect(endpoint.metadata).toBe(addEndpointEvent.data.metadata);
      done("");
    });

    // When
    webRTCEndpoint.receiveMediaEvent(JSON.stringify(addEndpointEvent));
  }));

it("Parses the metadata", () => {
  // Given
  type EndpointMetadata = { goodStuff: string };
  function endpointMetadataParser(data: any): EndpointMetadata {
    return { goodStuff: data.goodStuff };
  }
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint({ endpointMetadataParser });

  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createConnectedEvent()));

  // When
  webRTCEndpoint.receiveMediaEvent(
    JSON.stringify(createEndpointAdded(endpointId, { goodStuff: "ye", extraFluff: "nah" })),
  );

  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  const addedEndpoint = Object.values(endpoints)[0];
  expect(addedEndpoint.metadata).toEqual({ goodStuff: "ye" });
  expect(addedEndpoint.metadataParsingError).toBeUndefined();
  expect(addedEndpoint.rawMetadata).toEqual({ goodStuff: "ye", extraFluff: "nah" });
});

it("Properly handles incorrect metadata", () => {
  // Given
  type EndpointMetadata = { validMetadata: true };
  function endpointMetadataParser(data: any): EndpointMetadata {
    if (!data?.validMetadata) throw "Invalid";
    return { validMetadata: true };
  }
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint({ endpointMetadataParser });

  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createConnectedEvent()));

  // When
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createEndpointAdded(endpointId, { trash: "metadata" })));

  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  const addedEndpoint = Object.values(endpoints)[0];
  expect(addedEndpoint.metadata).toBeUndefined();
  expect(addedEndpoint.metadataParsingError).toBe("Invalid");
  expect(addedEndpoint.rawMetadata).toEqual({ trash: "metadata" });
});

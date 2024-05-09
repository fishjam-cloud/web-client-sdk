import {
  createAddLocalTrackAnswerData,
  createAddLocalTrackSDPOffer,
  createAddTrackMediaEvent,
  createConnectedEventWithOneEndpointWithOneTrack,
  stream,
} from "./fixtures";
import { WebRTCEndpoint } from "../src";
import { mockRTCPeerConnection } from "./mocks";

export const setupRoom = (webRTCEndpoint: WebRTCEndpoint, endpointId: string, trackId: string): void => {
  const connectedEvent = createConnectedEventWithOneEndpointWithOneTrack(endpointId, trackId);
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(connectedEvent));

  // Right now info about tracks from connectedEvent is ignored
  // We need to fix it but not in this commit
  // We need more tests (e2e) to introduce this change
  const addTrackEvent = createAddTrackMediaEvent(endpointId, trackId);
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(addTrackEvent));
};

// Fix proposal:
//
// "connected" handler
//
// const otherEndpoints: Endpoint[] = endpoints.map((endpoint) => {
//   const endpointTracks: [string, any][] = Object.entries(endpoint.tracks || {});
//   const tracks = this.mapMediaEventTracksToTrackContextImpl(endpointTracks, endpoint);
//   return { ...endpoint, tracks };
// });
//
// otherEndpoints.forEach((endpoint) => {
//   this.addEndpoint(endpoint);
// });
// otherEndpoints.forEach((endpoint) => {
//           endpoint.tracks.forEach((ctx, trackId) => {
//
// "endpointAdded"
// this.addEndpoint({ ...endpoint, tracks: new Map() });
//
// remove todo if-else statement from addEndpoint function

export const setupRoomWithMocks = async (
  webRTCEndpoint: WebRTCEndpoint,
  endpointId: string,
  trackId: string,
): Promise<void> => {
  mockRTCPeerConnection();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createAddLocalTrackSDPOffer()));
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createAddLocalTrackAnswerData(trackId)));

  const connection = webRTCEndpoint["connection"]!;
  const transciever = new RTCRtpTransceiver();

  // @ts-ignore
  const rtcTrackEvent: RTCTrackEvent = {
    streams: [stream],
    transceiver: transciever,
  };
  // @ts-ignore
  connection.ontrack(rtcTrackEvent);

  return new Promise((resolve) => resolve());
};

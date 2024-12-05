import { MediaEvent } from '@fishjam-cloud/protobufs/server';

import type { WebRTCEndpoint } from '../src';
import {
  createAddLocalTrackAnswerData,
  createAddLocalTrackSDPOffer,
  createAddTrackMediaEvent,
  createConnectedEventWithOneEndpointWithOneTrack,
  stream,
} from './fixtures';
import { mockRTCPeerConnection } from './mocks';

export const setupRoom = (webRTCEndpoint: WebRTCEndpoint, endpointId: string, trackId: string): void => {
  const connected = createConnectedEventWithOneEndpointWithOneTrack(endpointId, trackId);
  const connectedEvent = MediaEvent.encode({ connected }).finish();
  webRTCEndpoint.receiveMediaEvent(connectedEvent);

  // Right now info about tracks from connectedEvent is ignored
  // We need to fix it but not in this commit
  // We need more tests (e2e) to introduce this change
  const tracksAdded = createAddTrackMediaEvent(endpointId, trackId);
  const tracksAddedEvent = MediaEvent.encode({ tracksAdded }).finish();
  webRTCEndpoint.receiveMediaEvent(tracksAddedEvent);
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

  const offerData = createAddLocalTrackSDPOffer();
  webRTCEndpoint.receiveMediaEvent(MediaEvent.encode({ offerData }).finish());

  const sdpAnswer = createAddLocalTrackAnswerData(trackId);
  webRTCEndpoint.receiveMediaEvent(MediaEvent.encode({ sdpAnswer }).finish());

  const connection = webRTCEndpoint['connectionManager']!;
  const transciever = new RTCRtpTransceiver();

  // @ts-ignore
  const rtcTrackEvent: RTCTrackEvent = {
    streams: [stream],
    transceiver: transciever,
    // @ts-expect-error
    track: {
      kind: 'video',
    },
  };
  // @ts-ignore
  connection.getConnection().ontrack(rtcTrackEvent);

  return new Promise((resolve) => resolve());
};

import { faker } from '@faker-js/faker';
import type { MediaEvent_Track, MediaEvent_VadNotification_Status } from '@fishjam-cloud/protobufs/server';
import {
  MediaEvent_Connected,
  MediaEvent_Endpoint,
  MediaEvent_EndpointAdded,
  MediaEvent_EndpointRemoved,
  MediaEvent_EndpointUpdated,
  MediaEvent_OfferData,
  MediaEvent_SdpAnswer,
  MediaEvent_TracksAdded,
  MediaEvent_TracksRemoved,
  MediaEvent_TrackUpdated,
  MediaEvent_TrackVariantSwitched,
  MediaEvent_VadNotification,
} from '@fishjam-cloud/protobufs/server';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import { vi } from 'vitest';

import { Variant } from '../src';

export const exampleEndpointId = 'exampleEndpointId';
export const notExistingEndpointId = 'notExistingEndpointId';

export const exampleTrackId = 'exampleTrackId';
export const notExistingTrackId = 'notExistingTrackId';

export const mockTrack = new FakeMediaStreamTrack({ kind: 'video' });
const MediaStreamMock = vi.fn().mockImplementation(() => {});
export const stream = new MediaStreamMock();

export const createTrackWithSimulcast = (metadata: unknown = undefined): MediaEvent_Track => ({
  metadataJson: JSON.stringify(metadata),
  simulcastConfig: {
    enabled: true,
    enabledVariants: [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH],
    disabledVariants: [],
  },
});

export const createEmptyEndpoint = (): MediaEvent_Endpoint =>
  MediaEvent_Endpoint.create({ trackIdToTrack: {}, endpointType: 'webrtc' });

export const createConnectedEvent = (endpointId = faker.string.uuid()): MediaEvent_Connected => {
  return MediaEvent_Connected.create({ endpointId, endpointIdToEndpoint: { [endpointId]: createEmptyEndpoint() } });
};

export const createEncodingSwitchedEvent = (
  endpointId: string,
  trackId: string,
  variant: Variant,
): MediaEvent_TrackVariantSwitched =>
  MediaEvent_TrackVariantSwitched.create({
    variant,
    endpointId,
    trackId,
  });

// export const createBandwidthEstimationEvent = (): CustomBandwidthEstimationEvent =>
//   CustomBandwidthEstimationEventSchema.parse({
//     data: {
//       data: {
//         estimation: 261506.7264961106,
//       },
//       type: 'bandwidthEstimation',
//     },
//     type: 'custom',
//   });

export const createCustomVadNotificationEvent = (
  trackId: string,
  status: MediaEvent_VadNotification_Status,
): MediaEvent_VadNotification =>
  MediaEvent_VadNotification.create({
    trackId,
    status,
  });

export const createTrackUpdatedEvent = (
  trackId: string,
  endpointId: string,
  metadata: unknown,
): MediaEvent_TrackUpdated =>
  MediaEvent_TrackUpdated.create({
    endpointId: endpointId,
    metadataJson: JSON.stringify(metadata),
    trackId: trackId,
  });

export const createEndpointAdded = (endpointId: string, metadata: unknown = undefined): MediaEvent_EndpointAdded =>
  MediaEvent_EndpointAdded.create({
    endpointId,
    metadataJson: JSON.stringify(metadata),
  });

export const createEndpointRemoved = (endpointId: string): MediaEvent_EndpointRemoved =>
  MediaEvent_EndpointRemoved.create({
    endpointId,
  });

export const createConnectedEventWithOneEndpoint = (
  endpointId: string = faker.string.uuid(),
  localEndpointId?: string,
): MediaEvent_Connected => {
  const connectedEvent = createConnectedEvent(localEndpointId);
  const endpoint = createEmptyEndpoint();

  connectedEvent.endpointIdToEndpoint = { ...connectedEvent.endpointIdToEndpoint, [endpointId]: endpoint };
  return MediaEvent_Connected.create(connectedEvent);
};

export const createConnectedEventWithOneEndpointWithOneTrack = (
  remoteEndpointId: string,
  trackId: string,
  localEndpointId?: string,
): MediaEvent_Connected => {
  const connectedEvent = createConnectedEvent(localEndpointId);

  const remoteEndpoint = createEmptyEndpoint();

  remoteEndpoint.trackIdToTrack[trackId] = createTrackWithSimulcast();

  connectedEvent.endpointIdToEndpoint = {
    ...connectedEvent.endpointIdToEndpoint,
    [remoteEndpointId]: remoteEndpoint,
  };

  return MediaEvent_Connected.create(connectedEvent);
};

export const createAddTrackMediaEvent = (
  endpointId: string,
  trackId: string,
  metadata: any = undefined,
): MediaEvent_TracksAdded =>
  MediaEvent_TracksAdded.create({
    endpointId: endpointId,
    trackIdToTrack: {
      [trackId]: createTrackWithSimulcast(metadata),
    },
  });

export const createTracksRemovedEvent = (endpointId: string, trackIds: string[]): MediaEvent_TracksRemoved =>
  MediaEvent_TracksRemoved.create({
    endpointId: endpointId,
    trackIds,
  });

export const createCustomOfferDataEventWithOneVideoTrack = (): MediaEvent_OfferData =>
  MediaEvent_OfferData.create({
    tracksTypes: {
      audio: 0,
      video: 1,
    },
  });

export const createAddLocalTrackSDPOffer = (): MediaEvent_OfferData =>
  MediaEvent_OfferData.create({
    tracksTypes: {
      audio: 0,
      video: 0,
    },
  });

export const createAnswerData = (trackId: string): MediaEvent_SdpAnswer =>
  MediaEvent_SdpAnswer.create({
    sdp: `v=0\r
    o=- 39483584182226872 0 IN IP4 127.0.0.1\r
    s=-\r
    t=0 0\r
    a=group:BUNDLE 0\r
    a=extmap-allow-mixed\r
    a=ice-lite\r
    m=video 9 UDP/TLS/RTP/SAVPF 102 103\r
    c=IN IP4 0.0.0.0\r
    a=sendonly\r
    a=ice-ufrag:fXa4\r
    a=ice-pwd:mC2wFgKGsN3cXnxadEhVaa\r
    a=ice-options:trickle\r
    a=fingerprint:sha-256 50:65:CB:9F:2B:B5:62:7F:20:59:79:C6:7B:49:D8:DF:C2:B5:59:1F:E2:7D:68:F8:C3:07:73:8B:16:70:FB:DD\r
    a=setup:passive\r
    a=mid:0\r
    a=msid:60ff1fb2-6868-42be-8c92-311733034415 ea1339b9-54ce-445b-9cff-2568f9ac504b\r
    a=rtcp-mux\r
    a=rtpmap:102 H264/90000\r
    a=fmtp:102 profile-level-id=42001f;level-asymmetry-allowed=1;packetization-mode=1\r
    a=rtpmap:103 rtx/90000\r
    a=fmtp:103 apt=102\r
    a=extmap:4 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r
    a=rtcp-fb:102 transport-cc\r
    a=extmap:9 urn:ietf:params:rtp-hdrext:sdes:mid\r
    a=extmap:10 urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id\r
    a=extmap:11 urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id\r
    a=rtcp-fb:102 ccm fir\r
    a=rtcp-fb:102 nack\r
    a=rtcp-fb:102 nack pli\r
    a=rtcp-rsize\r
    a=ssrc:663086196 cname:${trackId}-video-60ff1fb2-6868-42be-8c92-311733034415\r
    `,
    midToTrackId: {
      '0': '9afe80ce-1964-4958-a386-d7a9e3097ca7:5c74b6b3-cb72-49f1-a76b-0df4895a3d32',
    },
  });

export const createAddLocalTrackAnswerData = (trackId: string): MediaEvent_SdpAnswer =>
  MediaEvent_SdpAnswer.create({
    midToTrackId: {
      '0': trackId,
    },
    sdp: `v=0\r
    o=- 63903156084304368 0 IN IP4 127.0.0.1\r
    s=-\r
    t=0 0\r
    a=group:BUNDLE 0\r
    a=extmap-allow-mixed\r
    a=ice-lite\r
    m=video 9 UDP/TLS/RTP/SAVPF 106 107\r
    c=IN IP4 0.0.0.0\r
    a=recvonly\r
    a=ice-ufrag:dHiY\r
    a=ice-pwd:IAPCE68QAQ8AxSF0OQIEZp\r
    a=ice-options:trickle\r
    a=fingerprint:sha-256 C1:50:4C:EC:98:1D:62:C8:DA:AE:F8:5B:44:4F:76:BB:4E:FF:5E:51:3E:A7:62:9B:58:38:A5:13:D0:B1:50:67\r
    a=setup:passive\r
    a=mid:0\r
    a=msid:7bf8bef4-be67-456c-8635-ba58339c29e9 ad3deb09-60a6-4bfc-aa14-482ed4f60667\r
    a=rtcp-mux\r
    a=rtpmap:106 H264/90000\r
    a=fmtp:106 profile-level-id=42e01f;level-asymmetry-allowed=1;packetization-mode=1\r
    a=rtpmap:107 rtx/90000\r
    a=fmtp:107 apt=106\r
    a=extmap:4 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r
    a=rtcp-fb:106 transport-cc\r
    a=extmap:9 urn:ietf:params:rtp-hdrext:sdes:mid\r
    a=extmap:10 urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id\r
    a=extmap:11 urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id\r
    a=rtcp-fb:106 ccm fir\r
    a=rtcp-fb:106 nack\r
    a=rtcp-fb:106 nack pli\r
    a=rtcp-rsize\r
    `,
  });

export const createEndpointUpdatedPeerMetadata = (endpointId: string, metadata: unknown): MediaEvent_EndpointUpdated =>
  MediaEvent_EndpointUpdated.create({
    endpointId,
    metadataJson: JSON.stringify(metadata),
  });

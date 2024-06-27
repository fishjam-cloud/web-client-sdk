import {
  ConnectedMediaEvent,
  ConnectedMediaEventSchema,
  CustomEncodingUpdatedEvent,
  CustomEncodingSwitchedEventSchema,
  CustomOfferDataEvent,
  CustomOfferDataEventSchema,
  CustomSdpAnswerDataEvent,
  CustomSdpAnswerDataEventSchema,
  Endpoint,
  EndpointSchema,
  EndpointUpdatedWebrtcEvent,
  EndpointUpdatedWebrtcEventSchema,
  Track,
  TracksAddedMediaEvent,
  TracksAddedMediaEventSchema,
  CustomBandwidthEstimationEventSchema,
  CustomBandwidthEstimationEvent,
  CustomVadNotificationEvent,
  CustomVadNotificationEventSchema,
  TrackUpdatedEvent,
  TrackUpdatedEventSchema,
  EndpointAddedWebrtcEvent,
  EndpointAddedWebrtcEventSchema,
  EndpointRemovedEventSchema,
  EndpointRemovedEvent,
  TracksRemovedEvent,
  TracksRemovedEventSchema,
} from './schema';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import { TrackEncoding, VadStatus } from '../src';
import { vi } from 'vitest';

export const endpointId = 'exampleEndpointId';
export const notExistingEndpointId = 'notExistingEndpointId';

export const trackId = 'exampleTrackId';
export const notExistingTrackId = 'notExistingTrackId';

export const mockTrack = new FakeMediaStreamTrack({ kind: 'video' });
const MediaStreamMock = vi.fn().mockImplementation(() => {});
export const stream = new MediaStreamMock();

export const createSimulcastTrack = (metadata: any = undefined): Track => ({
  metadata,
  simulcastConfig: {
    enabled: true,
    activeEncodings: ['h', 'm', 'l'],
  },
});

export const createEmptyEndpoint = (endpointId?: string): Endpoint =>
  EndpointSchema.parse({
    id: endpointId ?? '210fdb82-80d2-4868-8c31-a45f54f6e3c9',
    metadata: null,
    trackIdToMetadata: {},
    tracks: {},
    type: 'webrtc',
  });

export const createConnectedEvent = (
  localEndpointId?: string,
): ConnectedMediaEvent => {
  const id = localEndpointId ?? '7b789673-8600-4c8b-8f45-476b86cb820d';

  return ConnectedMediaEventSchema.parse({
    type: 'connected',
    data: {
      id: id, // peerId
      otherEndpoints: [],
    },
  });
};

export const createEncodingSwitchedEvent = (
  endpointId: string,
  trackId: string,
  encoding: TrackEncoding,
): CustomEncodingUpdatedEvent =>
  CustomEncodingSwitchedEventSchema.parse({
    data: {
      data: {
        encoding: encoding,
        endpointId: endpointId,
        reason: 'other',
        trackId: trackId,
      },
      type: 'encodingSwitched',
    },
    type: 'custom',
  });

export const createBandwidthEstimationEvent =
  (): CustomBandwidthEstimationEvent =>
    CustomBandwidthEstimationEventSchema.parse({
      data: {
        data: {
          estimation: 261506.7264961106,
        },
        type: 'bandwidthEstimation',
      },
      type: 'custom',
    });

export const createCustomVadNotificationEvent = (
  trackId: string,
  vadStatus: VadStatus,
): CustomVadNotificationEvent =>
  CustomVadNotificationEventSchema.parse({
    data: {
      data: {
        status: vadStatus,
        trackId: trackId,
      },
      type: 'vadNotification',
    },
    type: 'custom',
  });

export const createTrackUpdatedEvent = (
  trackId: string,
  endpointId: string,
  metadata: unknown,
): TrackUpdatedEvent =>
  TrackUpdatedEventSchema.parse({
    data: {
      endpointId: endpointId,
      metadata: metadata,
      trackId: trackId,
    },
    type: 'trackUpdated',
  });

export const createEndpointAdded = (
  endpointId: string,
  metadata: any = undefined,
): EndpointAddedWebrtcEvent =>
  EndpointAddedWebrtcEventSchema.parse({
    data: {
      id: endpointId,
      metadata,
      type: 'webrtc',
    },
    type: 'endpointAdded',
  });

export const createEndpointRemoved = (
  endpointId: string,
): EndpointRemovedEvent =>
  EndpointRemovedEventSchema.parse({
    data: {
      id: endpointId,
    },
    type: 'endpointRemoved',
  });

export const createConnectedEventWithOneEndpoint = (
  endpointId?: string,
  localEndpointId?: string,
): ConnectedMediaEvent => {
  const connectedEvent = createConnectedEvent(localEndpointId);
  connectedEvent.data.otherEndpoints = [createEmptyEndpoint(endpointId)];
  return ConnectedMediaEventSchema.parse(connectedEvent);
};

export const createConnectedEventWithOneEndpointWithOneTrack = (
  remoteEndpointId: string,
  trackId: string,
  localEndpointId?: string,
): ConnectedMediaEvent => {
  const connectedEvent = createConnectedEvent(localEndpointId);
  connectedEvent.data.otherEndpoints = [createEmptyEndpoint(remoteEndpointId)];

  const endpoint = connectedEvent.data.otherEndpoints[0];

  endpoint.tracks[trackId] = createSimulcastTrack();
  endpoint.trackIdToMetadata[trackId] = {};

  return ConnectedMediaEventSchema.parse(connectedEvent);
};

export const createAddTrackMediaEvent = (
  endpointId: string,
  trackId: string,
  metadata: any = undefined,
): TracksAddedMediaEvent =>
  TracksAddedMediaEventSchema.parse({
    type: 'tracksAdded',
    data: {
      endpointId: endpointId,
      tracks: {
        [trackId]: createSimulcastTrack(metadata),
      },
      trackIdToMetadata: {
        [trackId]: {},
      },
    },
  });

export const createTracksRemovedEvent = (
  endpointId: string,
  trackIds: string[],
): TracksRemovedEvent =>
  TracksRemovedEventSchema.parse({
    type: 'tracksRemoved',
    data: {
      endpointId: endpointId,
      trackIds,
    },
  });

export const createCustomOfferDataEventWithOneVideoTrack =
  (): CustomOfferDataEvent =>
    CustomOfferDataEventSchema.parse({
      data: {
        data: {
          integratedTurnServers: [
            {
              password: 'E9ck/2hJCkkuVSmPfFrNg2l1+JA=',
              serverAddr: '192.168.1.95',
              serverPort: 50018,
              transport: 'udp',
              username: '1698997572:dedfa04f-b30a-433a-86d5-03336a828caa',
            },
          ],
          tracksTypes: {
            audio: 0,
            video: 1,
          },
        },
        type: 'offerData',
      },
      type: 'custom',
    });

export const createAddLocalTrackSDPOffer = (): CustomOfferDataEvent =>
  CustomOfferDataEventSchema.parse({
    data: {
      data: {
        integratedTurnServers: [
          {
            password: 'LowwCOr4yR6KhD9LanOMfNbl1J4=',
            serverAddr: '192.168.1.100',
            serverPort: 50011,
            transport: 'udp',
            username: '1700768416:1423714f-5a75-4dce-9c99-8ec0dbf940ed',
          },
        ],
        tracksTypes: {
          audio: 0,
          video: 0,
        },
      },
      type: 'offerData',
    },
    type: 'custom',
  });

export const createAnswerData = (trackId: string): CustomSdpAnswerDataEvent =>
  CustomSdpAnswerDataEventSchema.parse({
    data: {
      data: {
        midToTrackId: {
          '0': '9afe80ce-1964-4958-a386-d7a9e3097ca7:5c74b6b3-cb72-49f1-a76b-0df4895a3d32',
        },
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
        type: 'answer',
      },
      type: 'sdpAnswer',
    },
    type: 'custom',
  });

export const createAddLocalTrackAnswerData = (
  trackId: string,
): CustomSdpAnswerDataEvent =>
  CustomSdpAnswerDataEventSchema.parse({
    data: {
      data: {
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
        type: 'answer',
      },
      type: 'sdpAnswer',
    },
    type: 'custom',
  });

export const createEndpointUpdated = (
  endpointId: string,
  metadata: any,
): EndpointUpdatedWebrtcEvent =>
  EndpointUpdatedWebrtcEventSchema.parse({
    data: {
      id: endpointId,
      metadata: metadata,
    },
    type: 'endpointUpdated',
  });

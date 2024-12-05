import type { Endpoint } from '@fishjam-cloud/webrtc-client';

import type { Component, Peer } from './types';

export const isPeer = <PeerMetadata, TrackMetadata>(
  endpoint: Endpoint,
): endpoint is Peer<PeerMetadata, TrackMetadata> => endpoint.type === 'webrtc' || endpoint.type === 'exwebrtc';

export const isComponent = (endpoint: Endpoint): endpoint is Component =>
  endpoint.type === 'recording' ||
  endpoint.type === 'hls' ||
  endpoint.type === 'file' ||
  endpoint.type === 'rtsp' ||
  endpoint.type === 'sip';

import { WebRTCEndpoint } from '../../src';
import { endpointId, trackId } from '../fixtures';
import { setupRoomWithMocks } from '../utils';
import { deserializePeerMediaEvent } from '../../src/mediaEvent';
import { expect, it } from 'vitest';

it('Disconnect sets connection to undefined', async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoomWithMocks(webRTCEndpoint, endpointId, trackId);

  // When
  webRTCEndpoint.disconnect();

  // Then
  const connection = webRTCEndpoint['connectionManager'];
  expect(connection).toBe(undefined);
});

it('Disconnect invokes disconnected event', () =>
  new Promise((done) => {
    (async () => {
      // Given
      const webRTCEndpoint = new WebRTCEndpoint();

      await setupRoomWithMocks(webRTCEndpoint, endpointId, trackId);

      webRTCEndpoint.on('sendMediaEvent', (mediaEvent) => {
        const event = deserializePeerMediaEvent(mediaEvent);
        expect(event.disconnect).toBeTruthy();
        done('');
      });

      // When
      webRTCEndpoint.disconnect();
    })();
  }));

import { WebRTCEndpoint } from '../../src';
import { endpointId, trackId } from '../fixtures';
import { setupRoomWithMocks } from '../utils';
import { expect, it } from 'vitest';

it('CleanUp sets connection to undefined', async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoomWithMocks(webRTCEndpoint, endpointId, trackId);

  // When
  webRTCEndpoint.cleanUp();

  // Then
  const connection = webRTCEndpoint['connection'];
  expect(connection).toBe(undefined);
});

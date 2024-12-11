import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { exampleEndpointId, exampleTrackId } from '../fixtures';
import { setupRoomWithMocks } from '../utils';

it('CleanUp sets connection to undefined', async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoomWithMocks(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  // When
  webRTCEndpoint.cleanUp();

  // Then
  const connection = webRTCEndpoint['connectionManager'];
  expect(connection).toBe(undefined);
});

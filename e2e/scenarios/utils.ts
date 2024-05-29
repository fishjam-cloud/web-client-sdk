import { expect, Page, test, TestInfo } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';

export const TO_PASS_TIMEOUT_MILLIS = 10 * 1000; // 10 seconds
export const addScreenShare = async (page: Page) =>
  await test.step('Add screenshare', async () => {
    await page
      .getByRole('button', { name: 'Start screenshare', exact: true })
      .click();
  });

const expectWithLongerTimeout = expect.configure({
  timeout: TO_PASS_TIMEOUT_MILLIS,
});

export const createAndJoinPeer = async (
  page: Page,
  roomId: string,
): Promise<string> =>
  test.step('Create and join peer', async () => {
    const peerRequest = await createPeer(page, roomId);
    try {
      const {
        peer: { id: peerId },
        token: peerToken,
      } = (await peerRequest.json()).data;

      await test.step('Join room', async () => {
        await page.getByPlaceholder('token').fill(peerToken);
        await page
          .getByRole('button', { name: 'Connect', exact: true })
          .click();
        await expect(page.locator('#connection-status')).toContainText('true');
      });

      return peerId;
    } catch (e) {
      throw {
        status: peerRequest.status(),
        response: await peerRequest.json(),
      };
    }
  });

export const joinRoom = async (
  page: Page,
  roomId: string,
  metadata?: any,
  waitForConnection: boolean = true,
): Promise<string> =>
  test.step('Join room', async () => {
    const peerRequest = await createPeer(page, roomId);
    try {
      const {
        peer: { id: peerId },
        token: peerToken,
      } = (await peerRequest.json()).data;

      await page.getByPlaceholder('token').fill(peerToken);
      if (metadata !== undefined) {
        await page
          .getByPlaceholder('endpoint metadata')
          .fill(JSON.stringify(metadata));
      } else {
        await page.getByPlaceholder('endpoint metadata').clear();
      }
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      if (waitForConnection) {
        await expect(page.locator('#connection-status')).toContainText('true');
      }

      return peerId;
    } catch (e) {
      throw {
        status: peerRequest.status(),
        response: await peerRequest.json(),
      };
    }
  });

export const joinRoomAndAddScreenShare = async (
  page: Page,
  roomId: string,
): Promise<string> =>
  test.step('Join room and add track', async () => {
    const peerRequest = await createPeer(page, roomId);
    try {
      const {
        peer: { id: peerId },
        token: peerToken,
      } = (await peerRequest.json()).data;

      await test.step('Join room', async () => {
        await page.getByPlaceholder('token').fill(peerToken);
        await page
          .getByRole('button', { name: 'Connect', exact: true })
          .click();
        await expect(page.locator('#connection-status')).toContainText('true');
      });

      await addScreenShare(page);

      return peerId;
    } catch (e) {
      throw {
        status: peerRequest.status(),
        response: await peerRequest.json(),
      };
    }
  });

export const throwIfRemoteTracksAreNotPresent = async (
  page: Page,
  otherClientIds: string[],
) => {
  await test.step('Assert that remote tracks are visible', async () => {
    for (const peerId of otherClientIds) {
      await expect(
        page.locator(`css=video[data-peer-id="${peerId}"]`),
      ).toBeVisible();
    }
  });
};

export const assertThatRemoteTracksAreVisible = async (
  page: Page,
  otherClientIds: string[],
) => {
  await test.step('Assert that remote tracks are visible', async () => {
    const responses = await Promise.allSettled(
      otherClientIds.map((peerId) =>
        page.locator(`css=video[data-peer-id="${peerId}"]`),
      ),
    );
    const isAnyRejected = responses.some((e) => e.status === 'rejected');
    expect(isAnyRejected).toBe(false);
  });
};

type WebrtcClient = { webrtc?: { connection?: RTCPeerConnection } };
type WindowType = typeof window;

export const assertThatOtherVideoIsPlaying = async (page: Page) => {
  await test.step('Assert that media is working', async () => {
    const getDecodedFrames: () => Promise<number> = () =>
      page.evaluate(async () => {
        const connection = (window as WindowType & WebrtcClient)?.webrtc
          ?.connection;
        // connection object is available after first renegotiation (sdpOffer, sdpAnswer)
        if (!window || !connection) return -1;
        const stats = await connection.getStats();
        for (const stat of stats.values()) {
          if (stat.type === 'inbound-rtp') {
            return stat.framesDecoded;
          }
        }
        return 0;
      });
    const firstMeasure = await getDecodedFrames();
    await expectWithLongerTimeout(async () =>
      expect((await getDecodedFrames()) > firstMeasure).toBe(true),
    ).toPass();
  });
};

export const takeScreenshot = async (
  page: Page,
  testInfo: TestInfo,
  name?: string,
) =>
  await test.step('Take screenshot', async () => {
    const screenShotId = uuidv4();
    const screenshot = await page.screenshot({
      path: `test-results/screenshots/${screenShotId}.png`,
    });
    await testInfo.attach(name ?? 'screenshot', {
      body: screenshot,
      contentType: 'image/png',
    });
  });

export const createRoom = async (page: Page, maxPeers?: number) =>
  await test.step('Create room', async () => {
    const data = {
      ...(maxPeers ? { maxPeers } : {}),
    };

    const roomRequest = await page.request.post('http://localhost:5002/room', {
      data,
    });
    return (await roomRequest.json()).data.room.id as string;
  });

export const createPeer = async (
  page: Page,
  roomId: string,
  enableSimulcast: boolean = true,
) =>
  await test.step('Create room', async () => {
    return await page.request.post(
      'http://localhost:5002/room/' + roomId + '/peer',
      {
        data: {
          type: 'webrtc',
          options: {
            enableSimulcast,
          },
        },
      },
    );
  });

export const clickButton = async (page: Page, name: string) =>
  await test.step(`Click '${name}' button`, async () => {
    await page.getByRole('button', { name: name, exact: true }).click();
  });

export const removeTrack = async (page: Page, button: string) =>
  await test.step(`Remove track ${button}`, async () => {
    await page.getByRole('button', { name: button, exact: true }).click();
  });

export const addAndReplaceTrack = async (page: Page) =>
  await test.step('Add and replace track', async () =>
    await page
      .getByRole('button', {
        name: 'Add and replace a heart',
        exact: true,
      })
      .click());

export const addAndRemoveTrack = async (page: Page) =>
  await test.step('Add and remove track', async () =>
    await page
      .getByRole('button', {
        name: 'Add and remove a heart',
        exact: true,
      })
      .click());

export const addBothMockTracks = async (page: Page) =>
  await test.step('Add both tracks', async () =>
    await page
      .getByRole('button', {
        name: 'Add both',
        exact: true,
      })
      .click());

export const assertThatAllTracksAreReady = async (
  page: Page,
  otherClientId: string,
  tracks: number,
) =>
  await test.step(`Assert that all (${tracks}) tracks are ready`, async () =>
    expectWithLongerTimeout(
      page.locator(`div[data-endpoint-id="${otherClientId}"]`),
    ).toHaveCount(tracks));

export const assertThatTrackBackgroundColorIsOk = async (
  page: Page,
  otherClientId: string,
  color: string,
) =>
  await test.step(`Assert that track background color is ${color}`, () =>
    expectWithLongerTimeout(
      page.locator(
        `xpath=//div[@data-endpoint-id="${otherClientId}"]//div[@data-color-name="${color}"]`,
      ),
    ).toBeVisible());

export const assertThatTrackReplaceStatusIsSuccess = async (
  page: Page,
  replaceStatus: string,
) =>
  await test.step(`Assert that track background color is ${replaceStatus}`, async () =>
    await expectWithLongerTimeout(
      page.locator(`xpath=//span[@data-replace-status="${replaceStatus}"]`),
    ).toBeVisible());

const NOT_EMPTY_TEXT = /\S/;

export const assertThatTrackIdIsNotEmpty = async (
  page: Page,
  locator: string,
) =>
  await test.step('Assert that track id is not empty', async () =>
    await expectWithLongerTimeout(page.locator(locator)).toContainText(
      NOT_EMPTY_TEXT,
    ));

export const assertThatBothTrackAreDifferent = async (
  page: Page,
  testInfo: TestInfo,
  name?: string,
) => {
  await test.step('Assert that both tracks are different', async () => {
    const locator1 = `(//div[@data-name="stream-id"])[1]`;
    const locator2 = `(//div[@data-name="stream-id"])[2]`;

    await assertThatTrackIdIsNotEmpty(page, locator1);
    await assertThatTrackIdIsNotEmpty(page, locator2);

    await takeScreenshot(page, testInfo, name);

    const text1 = await page.locator(locator1).textContent();
    const text2 = await page.locator(locator2).textContent();

    expect(text1 !== text2).toBe(true);
  });
};

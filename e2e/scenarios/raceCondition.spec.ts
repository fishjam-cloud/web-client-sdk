import { test } from '@playwright/test';
import {
  addAndRemoveTrack,
  addAndReplaceTrack,
  addBothMockTracks,
  assertThatAllTracksAreReady,
  assertThatBothTrackAreDifferent,
  assertThatOtherVideoIsPlaying,
  assertThatTrackBackgroundColorIsOk,
  assertThatTrackReplaceStatusIsSuccess,
  clickButton,
  createAndJoinPeer,
  createRoom,
  removeTrack,
  takeScreenshot,
} from './utils';

/*
 * Test in this file should be run a few times in a row to be sure that there is no race conditions.
 * To run a test multiple times use command:
 *
 * npm run test:e2e -- --repeat-each=20 -g "Test name"
 */

/*
 * This is the happy path test and everything should work every time. There should not be any RC.
 */
test('Add 2 tracks separately', async ({
  page: senderPage,
  context,
}, testInfo) => {
  // given
  const { senderId, roomId } = await test.step('Given', async () => {
    await senderPage.goto('/');
    const roomId = await createRoom(senderPage);
    const senderId = await createAndJoinPeer(senderPage, roomId);
    return { senderId, roomId };
  });

  // when
  await test.step('When', async () => {
    await clickButton(senderPage, 'Add a heart');
    await senderPage.waitForTimeout(500);
    await clickButton(senderPage, 'Add a brain');
  });

  // then
  await test.step('Then receiver', async () => {
    const receiverPage = await context.newPage();
    await receiverPage.goto('/');
    await createAndJoinPeer(receiverPage, roomId);
    await assertThatAllTracksAreReady(receiverPage, senderId, 2);
    await assertThatBothTrackAreDifferent(
      receiverPage,
      testInfo,
      'Should contain 2 different tracks',
    );
  });
});

test('RC: Add 2 tracks at the same time should not send the same one twice', async ({
  page: senderPage,
  context,
}, testInfo) => {
  // given
  await senderPage.goto('/');
  const roomId = await createRoom(senderPage);
  const senderId = await createAndJoinPeer(senderPage, roomId);

  // when
  await addBothMockTracks(senderPage);

  // then
  const receiverPage = await context.newPage();
  await receiverPage.goto('/');
  await createAndJoinPeer(receiverPage, roomId);

  await assertThatAllTracksAreReady(receiverPage, senderId, 2);
  await assertThatBothTrackAreDifferent(receiverPage, testInfo);
});

/*
 * This test reveals 2 race conditions:
 *
 * 1)
 * Adding track in the middle of renegotiation could result in adding the same track twice.
 *
 * server: tracksAdded       (REMOTE TRACK ADDED)
 * server: offerData         (REMOTE TRACK ADDED)
 * client: sdpOffer          (REMOTE TRACK ADDED)
 * client: renegotiateTracks (ADD LOCAL TRACK)
 * server: sdpAnswer         (REMOTE TRACK ADDED)
 * client: renegotiateTracks (ADD LOCAL TRACK) - error - same track added two times
 *
 * 2)
 * If client and server invoke renegotiation (client: addTrack, server: tracksRemoved)
 * there will be only one offerData, sdpOffer, sdpAnswer cycle, not two.
 *
 * client: renegotiateTracks (ADD LOCAL TRACK)
 * server: tracksRemoved     (REMOTE TRACK REMOVED)
 * server: offerData
 * client: sdpOffer
 * server: sdpAnswer
 */
test('RC: Add 2 tracks at the same time and remove one track', async ({
  page: sender1Page,
  context,
}, testInfo) => {
  const { sender1Id, roomId } =
    await test.step('Given sender 1 - join', async () => {
      await sender1Page.goto('/');
      const roomId = await createRoom(sender1Page);

      const sender1Id = await createAndJoinPeer(sender1Page, roomId);
      await sender1Page.waitForTimeout(500);
      return { sender1Id, roomId };
    });

  const { sender2Page, sender2Id } =
    await test.step('Given sender 2 - add 2 tracks', async () => {
      const sender2Page = await context.newPage();
      await sender2Page.goto('/');
      const sender2Id = await createAndJoinPeer(sender2Page, roomId);

      await clickButton(sender2Page, 'Add a heart');
      await sender2Page.waitForTimeout(500);
      await clickButton(sender2Page, 'Add a brain');
      return { sender2Page, sender2Id };
    });

  await test.step('When - first: add 2 tracks, second: remove track', async () => {
    await addBothMockTracks(sender1Page);
    await removeTrack(sender2Page, 'Remove a heart');
  });

  await test.step('Then sender 1 should get 1 track from sender 2', async () => {
    await assertThatAllTracksAreReady(sender1Page, sender2Id, 1);
    await takeScreenshot(sender1Page, testInfo, 'Should contain 1 track');
  });

  await test.step('Then sender 2 should get 2 tracks from sender 1', async () => {
    await assertThatAllTracksAreReady(sender2Page, sender1Id, 2);
    await assertThatBothTrackAreDifferent(
      sender2Page,
      testInfo,
      'Should contain 2 different tracks',
    );
  });
});

test('Slowly add and replace tracks', async ({ page: senderPage, context }) => {
  // given
  await senderPage.goto('/');
  const roomId = await createRoom(senderPage);

  const senderId = await createAndJoinPeer(senderPage, roomId);

  const receiverPage = await context.newPage();
  await receiverPage.goto('/');

  await createAndJoinPeer(receiverPage, roomId);

  // when
  await clickButton(senderPage, 'Add a heart');
  await assertThatTrackBackgroundColorIsOk(receiverPage, senderId, 'white');
  await senderPage.waitForTimeout(500);
  await clickButton(senderPage, 'Replace a heart');

  // then

  await assertThatAllTracksAreReady(receiverPage, senderId, 1);
  await assertThatTrackBackgroundColorIsOk(receiverPage, senderId, 'red');

  await assertThatTrackReplaceStatusIsSuccess(senderPage, 'success');
});

test('RC: Quickly add and replace a track', async ({
  page: senderPage,
  context,
}, testInfo) => {
  // given
  await senderPage.goto('/');
  const roomId = await createRoom(senderPage);

  const senderId = await createAndJoinPeer(senderPage, roomId);

  // when
  await addAndReplaceTrack(senderPage);

  // then
  const receiverPage = await context.newPage();
  await receiverPage.goto('/');

  await createAndJoinPeer(receiverPage, roomId);

  await assertThatAllTracksAreReady(receiverPage, senderId, 1);
  await assertThatOtherVideoIsPlaying(receiverPage);
  await takeScreenshot(receiverPage, testInfo);
  await assertThatTrackBackgroundColorIsOk(receiverPage, senderId, 'red');

  await assertThatTrackReplaceStatusIsSuccess(senderPage, 'success');

  await takeScreenshot(receiverPage, testInfo);
});

test('Add, replace and remove a track', async ({
  page: senderPage,
  context,
}, testInfo) => {
  // given
  await senderPage.goto('/');
  const roomId = await createRoom(senderPage);

  const senderId = await createAndJoinPeer(senderPage, roomId);

  const receiverPage = await context.newPage();
  await receiverPage.goto('/');
  await createAndJoinPeer(receiverPage, roomId);

  // when
  await addAndReplaceTrack(senderPage);
  await assertThatOtherVideoIsPlaying(receiverPage);
  await takeScreenshot(receiverPage, testInfo);
  await assertThatTrackBackgroundColorIsOk(receiverPage, senderId, 'red');
  await assertThatAllTracksAreReady(receiverPage, senderId, 1);
  await assertThatTrackReplaceStatusIsSuccess(senderPage, 'success');

  await clickButton(senderPage, 'Remove a heart');

  // then
  await assertThatAllTracksAreReady(receiverPage, senderId, 0);
  await takeScreenshot(receiverPage, testInfo);
});

test('replaceTrack blocks client', async ({ page: senderPage, context }) => {
  // given
  await senderPage.goto('/');
  const roomId = await createRoom(senderPage);

  const senderId = await createAndJoinPeer(senderPage, roomId);

  const receiverPage = await context.newPage();
  await receiverPage.goto('/');
  await createAndJoinPeer(receiverPage, roomId);

  // when
  await clickButton(senderPage, 'Add both');
  await clickButton(senderPage, 'Replace a heart');
  await clickButton(senderPage, 'Replace a brain');
  await clickButton(senderPage, 'Remove a heart');
  await clickButton(senderPage, 'Remove a brain');

  // then
  await assertThatAllTracksAreReady(receiverPage, senderId, 0);
});

test('Slowly add and remove a track', async ({
  page: senderPage,
  context,
}, testInfo) => {
  // given
  await senderPage.goto('/');
  const roomId = await createRoom(senderPage);

  const senderId = await createAndJoinPeer(senderPage, roomId);

  const receiverPage = await context.newPage();
  await receiverPage.goto('/');
  await createAndJoinPeer(receiverPage, roomId);

  // when
  await clickButton(senderPage, 'Add a heart');

  // then
  await assertThatAllTracksAreReady(receiverPage, senderId, 1);

  // when
  await senderPage.waitForTimeout(1000);
  await clickButton(senderPage, 'Remove a heart');

  // then
  await assertThatAllTracksAreReady(receiverPage, senderId, 0);

  await takeScreenshot(receiverPage, testInfo);
});

test('RC: Quickly add and remove a track', async ({
  page: senderPage,
  context,
}, testInfo) => {
  // given
  await senderPage.goto('/');
  const roomId = await createRoom(senderPage);

  const senderId = await createAndJoinPeer(senderPage, roomId);

  const receiverPage = await context.newPage();
  await receiverPage.goto('/');
  await createAndJoinPeer(receiverPage, roomId);
  await receiverPage.waitForTimeout(1000);

  // when
  await addAndRemoveTrack(senderPage);

  // then
  await assertThatAllTracksAreReady(receiverPage, senderId, 1);
  await assertThatAllTracksAreReady(receiverPage, senderId, 0);

  await takeScreenshot(receiverPage, testInfo);
});

import { test } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";

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
  removeTrack,
  takeScreenshot,
} from "./utils";

/*
 * Test in this file should be run a few times in a row to be sure that there is no race conditions.
 * To run a test multiple times use command:
 *
 * npm run test:e2e -- --repeat-each=20 -g "Test name"
 */

/*
 * This is the happy path test and everything should work every time. There should not be any RC.
 */
test("Add 2 tracks separately", async ({ page: senderPage, context }, testInfo) => {
  const roomName = uuidv4();

  const { senderId, } = await test.step("Given", async () => {
    await senderPage.goto("/");
    const { peerId } = await createAndJoinPeer(senderPage, "sender", roomName);
    return { senderId: peerId, roomName };
  });

  await test.step("When", async () => {
    await clickButton(senderPage, "Add a heart");
    await senderPage.waitForTimeout(500);
    await clickButton(senderPage, "Add a brain");
  });

  await test.step("Then receiver", async () => {
    const receiverPage = await context.newPage();
    await receiverPage.goto("/");
    await createAndJoinPeer(receiverPage, "receiver", roomName);
    await assertThatAllTracksAreReady(receiverPage, senderId, 2);
    await assertThatBothTrackAreDifferent(receiverPage, testInfo, "Should contain 2 different tracks");
  });
});

test("RC: Add 2 tracks at the same time should not send the same one twice", async ({
  page: senderPage,
  context,
}, testInfo) => {
  await senderPage.goto("/");
  const roomName = uuidv4();
  const { peerId: senderId } = await createAndJoinPeer(senderPage, "sender", roomName);

  await addBothMockTracks(senderPage);

  const receiverPage = await context.newPage();
  await receiverPage.goto("/");
  await createAndJoinPeer(receiverPage, "receiver", roomName);

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
test("RC: Add 2 tracks at the same time and remove one track", async ({ page: sender1Page, context }, testInfo) => {
  const roomName = uuidv4();
  const { sender1Id } = await test.step("Given sender 1 - join", async () => {
    await sender1Page.goto("/");
    const { peerId } = await createAndJoinPeer(sender1Page, "sender1", roomName);
    await sender1Page.waitForTimeout(500);
    return { sender1Id: peerId, roomName };
  });

  const { sender2Page, sender2Id } = await test.step("Given sender 2 - add 2 tracks", async () => {
    const senderPage = await context.newPage();
    await senderPage.goto("/");
    const { peerId } = await createAndJoinPeer(senderPage, "sender2", roomName);

    await clickButton(senderPage, "Add a heart");
    await senderPage.waitForTimeout(500);
    await clickButton(senderPage, "Add a brain");
    return { sender2Page: senderPage, sender2Id: peerId };
  });

  await test.step("When - first: add 2 tracks, second: remove track", async () => {
    await addBothMockTracks(sender1Page);
    await removeTrack(sender2Page, "Remove a heart");
  });

  await test.step("Then sender 1 should get 1 track from sender 2", async () => {
    await assertThatAllTracksAreReady(sender1Page, sender2Id, 1);
    await takeScreenshot(sender1Page, testInfo, "Should contain 1 track");
  });

  await test.step("Then sender 2 should get 2 tracks from sender 1", async () => {
    await assertThatAllTracksAreReady(sender2Page, sender1Id, 2);
    await assertThatBothTrackAreDifferent(sender2Page, testInfo, "Should contain 2 different tracks");
  });
});

test("Slowly add and replace tracks", async ({ page: senderPage, context }) => {
  await senderPage.goto("/");
  const roomName = uuidv4();
  const { peerId: senderId } = await createAndJoinPeer(senderPage, "sender", roomName);

  const receiverPage = await context.newPage();
  await receiverPage.goto("/");
  await createAndJoinPeer(receiverPage, "receiver", roomName);

  await clickButton(senderPage, "Add a heart");
  await assertThatTrackBackgroundColorIsOk(receiverPage, senderId, "white");
  await senderPage.waitForTimeout(500);
  await clickButton(senderPage, "Replace a heart");

  await assertThatAllTracksAreReady(receiverPage, senderId, 1);
  await assertThatTrackBackgroundColorIsOk(receiverPage, senderId, "red");

  await assertThatTrackReplaceStatusIsSuccess(senderPage, "success");
});

test("RC: Quickly add and replace a track", async ({ page: senderPage, context }, testInfo) => {
  await senderPage.goto("/");
  const roomName = uuidv4();
  const { peerId: senderId } = await createAndJoinPeer(senderPage, "sender", roomName);

  await addAndReplaceTrack(senderPage);

  const receiverPage = await context.newPage();
  await receiverPage.goto("/");
  await createAndJoinPeer(receiverPage, "receiver", roomName);

  await assertThatAllTracksAreReady(receiverPage, senderId, 1);
  await assertThatOtherVideoIsPlaying(receiverPage);
  await takeScreenshot(receiverPage, testInfo);
  await assertThatTrackBackgroundColorIsOk(receiverPage, senderId, "red");

  await assertThatTrackReplaceStatusIsSuccess(senderPage, "success");

  await takeScreenshot(receiverPage, testInfo);
});

test("Add, replace and remove a track", async ({ page: senderPage, context }, testInfo) => {
  await senderPage.goto("/");
  const roomName = uuidv4();
  const { peerId: senderId } = await createAndJoinPeer(senderPage, "sender", roomName);

  const receiverPage = await context.newPage();
  await receiverPage.goto("/");
  await createAndJoinPeer(receiverPage, "receiver", roomName);

  await addAndReplaceTrack(senderPage);
  await assertThatOtherVideoIsPlaying(receiverPage);
  await takeScreenshot(receiverPage, testInfo);
  await assertThatTrackBackgroundColorIsOk(receiverPage, senderId, "red");
  await assertThatAllTracksAreReady(receiverPage, senderId, 1);
  await assertThatTrackReplaceStatusIsSuccess(senderPage, "success");

  await clickButton(senderPage, "Remove a heart");

  await assertThatAllTracksAreReady(receiverPage, senderId, 0);
  await takeScreenshot(receiverPage, testInfo);
});

test("replaceTrack blocks client", async ({ page: senderPage, context }) => {
  await senderPage.goto("/");
  const roomName = uuidv4();
  const { peerId: senderId } = await createAndJoinPeer(senderPage, "sender", roomName);

  const receiverPage = await context.newPage();
  await receiverPage.goto("/");
  await createAndJoinPeer(receiverPage, "receiver", roomName);

  await clickButton(senderPage, "Add both");
  await clickButton(senderPage, "Replace a heart");
  await clickButton(senderPage, "Replace a brain");
  await clickButton(senderPage, "Remove a heart");
  await clickButton(senderPage, "Remove a brain");

  await assertThatAllTracksAreReady(receiverPage, senderId, 0);
});

test("Slowly add and remove a track", async ({ page: senderPage, context }, testInfo) => {
  await senderPage.goto("/");
  const roomName = uuidv4();
  const { peerId: senderId } = await createAndJoinPeer(senderPage, "sender", roomName);

  const receiverPage = await context.newPage();
  await receiverPage.goto("/");
  await createAndJoinPeer(receiverPage, "receiver", roomName);

  await clickButton(senderPage, "Add a heart");

  await assertThatAllTracksAreReady(receiverPage, senderId, 1);

  await senderPage.waitForTimeout(1000);
  await clickButton(senderPage, "Remove a heart");

  await assertThatAllTracksAreReady(receiverPage, senderId, 0);

  await takeScreenshot(receiverPage, testInfo);
});

test("RC: Quickly add and remove a track", async ({ page: senderPage, context }, testInfo) => {
  await senderPage.goto("/");
  const roomName = uuidv4();
  const { peerId: senderId } = await createAndJoinPeer(senderPage, "sender", roomName);

  const receiverPage = await context.newPage();
  await receiverPage.goto("/");
  await createAndJoinPeer(receiverPage, "receiver", roomName);
  await receiverPage.waitForTimeout(1000);

  await addAndRemoveTrack(senderPage);

  await assertThatAllTracksAreReady(receiverPage, senderId, 1);
  await assertThatAllTracksAreReady(receiverPage, senderId, 0);

  await takeScreenshot(receiverPage, testInfo);
});

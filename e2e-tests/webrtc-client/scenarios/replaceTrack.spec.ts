import { test } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";

import {
  assertThatTrackBackgroundColorIsOk,
  assertThatTrackIsPlaying,
  assertThatTrackStopped,
  clickButton,
  createAndJoinPeer,
} from "./utils";

test("Replace track with null", async ({ page: senderPage, context }) => {
  // given
  const roomName = uuidv4();
  await senderPage.goto("/");

  const { peerId: senderId } = await createAndJoinPeer(senderPage, "sender", roomName);

  const receiverPage = await context.newPage();
  await receiverPage.goto("/");

  await createAndJoinPeer(receiverPage, "receiver", roomName);

  // when
  await clickButton(senderPage, "Add brain");
  await assertThatTrackBackgroundColorIsOk(receiverPage, senderId, "green");
  await assertThatTrackIsPlaying(receiverPage, senderId);
  await clickButton(senderPage, "Mute track");

  // then
  await assertThatTrackStopped(receiverPage, senderId);
});

test("Mute and unmute track", async ({ page: senderPage, context }) => {
  // given
  const roomName = uuidv4();
  await senderPage.goto("/");

  const { peerId: senderId } = await createAndJoinPeer(senderPage, "sender", roomName);

  const receiverPage = await context.newPage();
  await receiverPage.goto("/");

  await createAndJoinPeer(receiverPage, "receiver", roomName);

  // when
  await clickButton(senderPage, "Add brain");
  await assertThatTrackBackgroundColorIsOk(receiverPage, senderId, "green");
  await assertThatTrackIsPlaying(receiverPage, senderId);
  await clickButton(senderPage, "Mute track");
  await assertThatTrackStopped(receiverPage, senderId);
  await clickButton(senderPage, "Replace with heart");

  // then
  await assertThatTrackBackgroundColorIsOk(receiverPage, senderId, "red");
  await assertThatTrackIsPlaying(receiverPage, senderId);
});

import { test } from '@playwright/test';
import {
  assertThatTrackBackgroundColorIsOk,
  assertThatTrackIsPlaying,
  assertThatTrackStopped,
  clickButton,
  createAndJoinPeer,
  createRoom,
} from './utils';

test('Replace track with null', async ({ page: senderPage, context }) => {
  // given
  await senderPage.goto('/');
  const roomId = await createRoom(senderPage);

  const senderId = await createAndJoinPeer(senderPage, roomId);

  const receiverPage = await context.newPage();
  await receiverPage.goto('/');

  await createAndJoinPeer(receiverPage, roomId);

  // when
  await clickButton(senderPage, 'Add brain');
  await assertThatTrackBackgroundColorIsOk(receiverPage, senderId, 'green');
  await assertThatTrackIsPlaying(receiverPage, senderId);
  await clickButton(senderPage, 'Mute track');

  // then
  await assertThatTrackStopped(receiverPage, senderId);
});

test('Mute and unmute track', async ({ page: senderPage, context }) => {
  // given
  await senderPage.goto('/');
  const roomId = await createRoom(senderPage);

  const senderId = await createAndJoinPeer(senderPage, roomId);

  const receiverPage = await context.newPage();
  await receiverPage.goto('/');

  await createAndJoinPeer(receiverPage, roomId);

  // when
  await clickButton(senderPage, 'Add brain');
  await assertThatTrackBackgroundColorIsOk(receiverPage, senderId, 'green');
  await assertThatTrackIsPlaying(receiverPage, senderId);
  await clickButton(senderPage, 'Mute track');
  await assertThatTrackStopped(receiverPage, senderId);
  await clickButton(senderPage, 'Replace with heart');

  // then
  await assertThatTrackBackgroundColorIsOk(receiverPage, senderId, 'red');
  await assertThatTrackIsPlaying(receiverPage, senderId);
});

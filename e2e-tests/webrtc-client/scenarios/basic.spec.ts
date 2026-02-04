import { expect, test } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";

import {
  assertThatOtherVideoIsPlaying,
  assertThatRemoteTracksAreVisible,
  joinRoomAndAddScreenShare,
  throwIfRemoteTracksAreNotPresent,
} from "./utils";

test("Displays basic UI", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByPlaceholder("token")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start screenshare", exact: true })).toBeVisible();
});

test("Connect 2 peers to 1 room", async ({ page: firstPage, context }) => {
  const secondPage = await context.newPage();
  await firstPage.goto("/");
  await secondPage.goto("/");

  const roomName = uuidv4();

  const firstClientId = await joinRoomAndAddScreenShare(firstPage, "peer1", roomName);
  const secondClientId = await joinRoomAndAddScreenShare(secondPage, "peer2", roomName);

  await assertThatRemoteTracksAreVisible(firstPage, [secondClientId]);
  await assertThatRemoteTracksAreVisible(secondPage, [firstClientId]);

  await Promise.all([assertThatOtherVideoIsPlaying(firstPage), assertThatOtherVideoIsPlaying(secondPage)]);
});

test("Peer doesn't disconnect when trying to set incorrect track encoding", async ({ page: firstPage, context }) => {
  const secondPage = await context.newPage();
  await firstPage.goto("/");
  await secondPage.goto("/");

  const roomName = uuidv4();

  await joinRoomAndAddScreenShare(firstPage, "peer1", roomName);
  const secondClientId = await joinRoomAndAddScreenShare(secondPage, "peer2", roomName);

  await assertThatRemoteTracksAreVisible(firstPage, [secondClientId]);
  await assertThatOtherVideoIsPlaying(firstPage);
  await firstPage.getByRole("button", { name: "Low", exact: true }).click();
  await assertThatOtherVideoIsPlaying(firstPage);
});

test("Client properly sees 3 other peers", async ({ page: firstPage, context }) => {
  const pages = [firstPage, ...(await Promise.all([...Array(3)].map(() => context.newPage())))];

  const roomName = uuidv4();

  const peerIds = await Promise.all(
    pages.map(async (page, idx) => {
      await page.goto("/");
      return await joinRoomAndAddScreenShare(page, `peer${idx}`, roomName);
    }),
  );

  await Promise.all(
    pages.map(async (page, idx) => {
      await assertThatRemoteTracksAreVisible(
        page,
        peerIds.filter((id) => id !== peerIds[idx]),
      );
      await assertThatOtherVideoIsPlaying(page);
    }),
  );
});

test("Peer see peers just in the same room", async ({ page: firstPage, context }) => {
  const [p1r1, p2r1, p1r2, p2r2] = [firstPage, ...(await Promise.all([...Array(3)].map(() => context.newPage())))];
  const [firstRoomPages, secondRoomPages] = [
    [p1r1, p2r1],
    [p1r2, p2r2],
  ];

  const firstRoomName = uuidv4();
  const secondRoomName = uuidv4();

  const firstRoomPeerIds = await Promise.all(
    firstRoomPages.map(async (page, idx) => {
      await page.goto("/");
      return await joinRoomAndAddScreenShare(page, `room1-peer${idx}`, firstRoomName);
    }),
  );

  const secondRoomPeerIds = await Promise.all(
    secondRoomPages.map(async (page, idx) => {
      await page.goto("/");
      return await joinRoomAndAddScreenShare(page, `room2-peer${idx}`, secondRoomName);
    }),
  );

  await Promise.all([
    ...firstRoomPages.map(async (page, idx) => {
      await assertThatRemoteTracksAreVisible(
        page,
        firstRoomPeerIds.filter((id) => id !== firstRoomPeerIds[idx]),
      );
      await expect(throwIfRemoteTracksAreNotPresent(page, secondRoomPeerIds)).rejects.toThrow();
      await assertThatOtherVideoIsPlaying(page);
    }),
    ...secondRoomPages.map(async (page, idx) => {
      await assertThatRemoteTracksAreVisible(
        page,
        secondRoomPeerIds.filter((id) => id !== secondRoomPeerIds[idx]),
      );
      await expect(throwIfRemoteTracksAreNotPresent(page, firstRoomPeerIds)).rejects.toThrow();
      await assertThatOtherVideoIsPlaying(page);
    }),
  ]);
});



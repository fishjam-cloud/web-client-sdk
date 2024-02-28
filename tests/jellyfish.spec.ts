import { test, expect } from "@playwright/test";
import {
  assertThatOtherVideoIsPlaying,
  assertThatRemoteTracksAreVisible,
  createRoom,
  joinRoomAndAddScreenShare,
} from "./utils";

test("displays basic UI", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Jellyfish Minimal React/);
  await expect(page.getByPlaceholder("token")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeVisible();
});

test("Connect 2 peers to 1 room", async ({ page: firstPage, context }) => {
  const secondPage = await context.newPage();
  await firstPage.goto("/");
  await secondPage.goto("/");

  const roomId = await createRoom(firstPage);

  const firstPageId = await joinRoomAndAddScreenShare(firstPage, roomId);
  const secondPageId = await joinRoomAndAddScreenShare(secondPage, roomId);

  await Promise.all([
    assertThatRemoteTracksAreVisible(firstPage, [secondPageId]),
    assertThatRemoteTracksAreVisible(secondPage, [firstPageId]),
  ]);
  await Promise.all([assertThatOtherVideoIsPlaying(firstPage), assertThatOtherVideoIsPlaying(secondPage)]);
});

test("Client properly sees 3 other peers", async ({ page, context }) => {
  const pages = [page, ...(await Promise.all([...Array(3)].map(() => context.newPage())))];

  const roomId = await createRoom(page);

  const peerIds = await Promise.all(
    pages.map(async (page) => {
      await page.goto("/");
      return await joinRoomAndAddScreenShare(page, roomId);
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

test("Peer see peers just in the same room", async ({ page, context }) => {
  const [p1r1, p2r1, p1r2, p2r2] = [page, ...(await Promise.all([...Array(3)].map(() => context.newPage())))];
  const [firstRoomPages, secondRoomPages] = [
    [p1r1, p2r1],
    [p1r2, p2r2],
  ];

  const firstRoomId = await createRoom(page);
  const secondRoomId = await createRoom(page);

  const firstRoomPeerIds = await Promise.all(
    firstRoomPages.map(async (page) => {
      await page.goto("/");
      return await joinRoomAndAddScreenShare(page, firstRoomId);
    }),
  );

  const secondRoomPeerIds = await Promise.all(
    secondRoomPages.map(async (page) => {
      await page.goto("/");
      return await joinRoomAndAddScreenShare(page, secondRoomId);
    }),
  );

  await Promise.all([
    ...firstRoomPages.map(async (page, idx) => {
      await assertThatRemoteTracksAreVisible(
        page,
        firstRoomPeerIds.filter((id) => id !== firstRoomPeerIds[idx]),
      );
      await expect(assertThatRemoteTracksAreVisible(page, secondRoomPeerIds)).rejects.toThrow();
      await assertThatOtherVideoIsPlaying(page);
    }),
    ...secondRoomPages.map(async (page, idx) => {
      await assertThatRemoteTracksAreVisible(
        page,
        secondRoomPeerIds.filter((id) => id !== secondRoomPeerIds[idx]),
      );
      await expect(assertThatRemoteTracksAreVisible(page, firstRoomPeerIds)).rejects.toThrow();
      await assertThatOtherVideoIsPlaying(page);
    }),
  ]);
});

test("Client throws an error if joining room at max capacity", async ({ page, context }) => {
  const [page1, page2, overflowingPage] = [page, ...(await Promise.all([...Array(2)].map(() => context.newPage())))];

  const roomId = await createRoom(page, 2);

  await Promise.all(
    [page1, page2].map(async (page) => {
      await page.goto("/");
      return await joinRoomAndAddScreenShare(page, roomId);
    }),
  );

  await overflowingPage.goto("/");
  await expect(joinRoomAndAddScreenShare(overflowingPage, roomId)).rejects.toEqual(
    expect.objectContaining({
      status: 503,
      response: {
        errors: `Reached peer limit in room ${roomId}`,
      },
    }),
  );
});

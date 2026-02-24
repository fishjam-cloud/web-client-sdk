import { expect, test } from "@playwright/test";

import {
  assertThatVideoIsPlaying,
  assertThatVideoStopped,
  startPublishing,
  startReceiving,
  stopPublishing,
  stopReceiving,
} from "./utils";

test("Displays basic UI", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "Start Publishing", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start Receiving", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#receive-video")).toBeVisible();
  await expect(page.locator("#publish-video")).toBeVisible();
});

test("Viewer receives a published stream", async ({ page }) => {
  await page.goto(`/?room=${encodeURIComponent(crypto.randomUUID())}`);

  await startPublishing(page);
  await startReceiving(page);
  await assertThatVideoIsPlaying(page);
});

test("Viewer stops receiving when disconnected", async ({ page }) => {
  await page.goto(`/?room=${encodeURIComponent(crypto.randomUUID())}`);
  await startPublishing(page);
  await startReceiving(page);
  await assertThatVideoIsPlaying(page);
  await stopReceiving(page);
  await assertThatVideoStopped(page);
});

test("Viewer can reconnect after disconnecting", async ({ page }) => {
  await page.goto(`/?room=${encodeURIComponent(crypto.randomUUID())}`);

  await startPublishing(page);
  await startReceiving(page);
  await assertThatVideoIsPlaying(page);
  await stopReceiving(page);
  await startReceiving(page);
  await assertThatVideoIsPlaying(page);
});

test("Stream ends when streamer stops publishing", async ({ page }) => {
  await page.goto(`/?room=${encodeURIComponent(crypto.randomUUID())}`);

  await startPublishing(page);
  await startReceiving(page);
  await assertThatVideoIsPlaying(page);
  await stopPublishing(page);
  await assertThatVideoStopped(page);
});
